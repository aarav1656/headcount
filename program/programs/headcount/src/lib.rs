use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::instructions::{
    load_current_index_checked, load_instruction_at_checked, ID as IX_SYSVAR_ID,
};
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{
    close_account, transfer_checked, CloseAccount, Mint, TokenAccount, TokenInterface,
    TransferChecked,
};

declare_id!("12kijt3UyT3TGnGbQn9Z4M9qe9uuHyc7ypWhLE57dkF3");

pub const ED25519_PROGRAM_ID: Pubkey = pubkey!("Ed25519SigVerify111111111111111111111111111");
pub const MAX_QUESTION: usize = 160;
pub const MAX_OPTION: usize = 40;
pub const MIN_OPTIONS: usize = 2;
pub const MAX_OPTIONS: usize = 6;
pub const ATTEST_PREFIX: &[u8] = b"headcount:v2";
/// Identity tiers. A seeker identity is the SGT mint, a wallet identity is the answerer wallet.
pub const TIER_WALLET: u8 = 0;
pub const TIER_SEEKER: u8 = 1;
/// prefix(12) || answerer(32) || identity(32) || tier(1) || expires_at i64 LE(8)
const ATTEST_LEN: usize = 12 + 32 + 32 + 1 + 8;

#[program]
pub mod headcount {
    use super::*;

    pub fn init_config(ctx: Context<InitConfig>, attestor: Pubkey) -> Result<()> {
        let c = &mut ctx.accounts.config;
        c.admin = ctx.accounts.admin.key();
        c.attestor = attestor;
        c.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn set_attestor(ctx: Context<SetAttestor>, attestor: Pubkey) -> Result<()> {
        ctx.accounts.config.attestor = attestor;
        Ok(())
    }

    pub fn create_poll(
        ctx: Context<CreatePoll>,
        poll_id: u64,
        question: String,
        options: Vec<String>,
        reward_per_answer: u64,
        max_answers: u32,
        closes_at: i64,
        seekers_only: bool,
    ) -> Result<()> {
        require!(
            !question.is_empty() && question.len() <= MAX_QUESTION,
            HeadcountError::QuestionLength
        );
        require!(
            (MIN_OPTIONS..=MAX_OPTIONS).contains(&options.len()),
            HeadcountError::OptionCount
        );
        require!(
            options.iter().all(|o| !o.is_empty() && o.len() <= MAX_OPTION),
            HeadcountError::OptionLength
        );
        require!(max_answers >= 1, HeadcountError::InvalidMaxAnswers);
        require!(reward_per_answer >= 1, HeadcountError::InvalidReward);
        let now = Clock::get()?.unix_timestamp;
        require!(closes_at > now, HeadcountError::InvalidCloseTime);

        let total = reward_per_answer
            .checked_mul(max_answers as u64)
            .ok_or(HeadcountError::MathOverflow)?;

        let poll = &mut ctx.accounts.poll;
        poll.creator = ctx.accounts.creator.key();
        poll.poll_id = poll_id;
        poll.reward_mint = ctx.accounts.reward_mint.key();
        poll.reward_per_answer = reward_per_answer;
        poll.max_answers = max_answers;
        poll.answers = 0;
        poll.closes_at = closes_at;
        poll.question = question;
        poll.options = options;
        poll.tallies = [0; MAX_OPTIONS];
        poll.closed = false;
        poll.bump = ctx.bumps.poll;
        poll.vault_bump = ctx.bumps.vault;
        poll.seekers_only = seekers_only;
        poll.seeker_tallies = [0; MAX_OPTIONS];
        poll.seeker_answers = 0;

        transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.creator_token.to_account_info(),
                    mint: ctx.accounts.reward_mint.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.creator.to_account_info(),
                },
            ),
            total,
            ctx.accounts.reward_mint.decimals,
        )
    }

    pub fn answer(
        ctx: Context<AnswerPoll>,
        choice: u8,
        identity: Pubkey,
        tier: u8,
        expires_at: i64,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let poll = &ctx.accounts.poll;
        require!(!poll.closed, HeadcountError::PollClosed);
        require!(now < poll.closes_at, HeadcountError::PollEnded);
        require!(poll.answers < poll.max_answers, HeadcountError::PollFull);
        require!(
            (choice as usize) < poll.options.len(),
            HeadcountError::InvalidChoice
        );
        require!(
            tier == TIER_WALLET || tier == TIER_SEEKER,
            HeadcountError::InvalidTier
        );
        require!(
            tier == TIER_SEEKER || identity == ctx.accounts.answerer.key(),
            HeadcountError::InvalidIdentity
        );
        require!(
            !poll.seekers_only || tier == TIER_SEEKER,
            HeadcountError::SeekersOnly
        );
        require!(now < expires_at, HeadcountError::AttestationExpired);

        let mut expected = [0u8; ATTEST_LEN];
        expected[..12].copy_from_slice(ATTEST_PREFIX);
        expected[12..44].copy_from_slice(ctx.accounts.answerer.key().as_ref());
        expected[44..76].copy_from_slice(identity.as_ref());
        expected[76] = tier;
        expected[77..85].copy_from_slice(&expires_at.to_le_bytes());
        verify_attestation(
            &ctx.accounts.instructions.to_account_info(),
            &ctx.accounts.config.attestor,
            &expected,
        )?;

        let poll = &mut ctx.accounts.poll;
        let slot = poll
            .tallies
            .get_mut(choice as usize)
            .ok_or(HeadcountError::InvalidChoice)?;
        *slot = slot.checked_add(1).ok_or(HeadcountError::MathOverflow)?;
        poll.answers = poll
            .answers
            .checked_add(1)
            .ok_or(HeadcountError::MathOverflow)?;
        if tier == TIER_SEEKER {
            let slot = poll
                .seeker_tallies
                .get_mut(choice as usize)
                .ok_or(HeadcountError::InvalidChoice)?;
            *slot = slot.checked_add(1).ok_or(HeadcountError::MathOverflow)?;
            poll.seeker_answers = poll
                .seeker_answers
                .checked_add(1)
                .ok_or(HeadcountError::MathOverflow)?;
        }

        let a = &mut ctx.accounts.answer;
        a.poll = poll.key();
        a.answerer = ctx.accounts.answerer.key();
        a.identity = identity;
        a.tier = tier;
        a.choice = choice;
        a.answered_at = now;
        a.bump = ctx.bumps.answer;

        let creator = poll.creator;
        let poll_id = poll.poll_id.to_le_bytes();
        let bump = [poll.bump];
        let reward = poll.reward_per_answer;
        let seeds: &[&[u8]] = &[b"poll", creator.as_ref(), &poll_id, &bump];
        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    mint: ctx.accounts.reward_mint.to_account_info(),
                    to: ctx.accounts.answerer_token.to_account_info(),
                    authority: ctx.accounts.poll.to_account_info(),
                },
                &[seeds],
            ),
            reward,
            ctx.accounts.reward_mint.decimals,
        )
    }

    pub fn close_poll(ctx: Context<ClosePoll>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let poll = &ctx.accounts.poll;
        require!(!poll.closed, HeadcountError::PollClosed);
        require!(
            now >= poll.closes_at || poll.answers == poll.max_answers,
            HeadcountError::CannotCloseYet
        );

        let poll_id = poll.poll_id.to_le_bytes();
        let seeds: &[&[u8]] = &[b"poll", poll.creator.as_ref(), &poll_id, &[poll.bump]];
        let remaining = ctx.accounts.vault.amount;
        if remaining > 0 {
            transfer_checked(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    TransferChecked {
                        from: ctx.accounts.vault.to_account_info(),
                        mint: ctx.accounts.reward_mint.to_account_info(),
                        to: ctx.accounts.creator_token.to_account_info(),
                        authority: ctx.accounts.poll.to_account_info(),
                    },
                    &[seeds],
                ),
                remaining,
                ctx.accounts.reward_mint.decimals,
            )?;
        }
        close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.vault.to_account_info(),
                destination: ctx.accounts.creator.to_account_info(),
                authority: ctx.accounts.poll.to_account_info(),
            },
            &[seeds],
        ))?;
        ctx.accounts.poll.closed = true;
        Ok(())
    }
}

/// The instruction immediately before this one must be a single-signature
/// Ed25519 verify whose signer is `attestor` and whose message is `expected`.
/// The runtime verifies the signature; we bind it to the right key and bytes.
fn verify_attestation(
    ix_sysvar: &AccountInfo,
    attestor: &Pubkey,
    expected: &[u8; ATTEST_LEN],
) -> Result<()> {
    let cur = load_current_index_checked(ix_sysvar)? as usize;
    require!(cur > 0, HeadcountError::MissingEd25519);
    let ix = load_instruction_at_checked(cur - 1, ix_sysvar)?;
    require!(
        ix.program_id == ED25519_PROGRAM_ID,
        HeadcountError::MissingEd25519
    );
    let d = &ix.data;
    // header: num_signatures u8, padding u8, then one 14-byte offsets struct
    require!(d.len() >= 16, HeadcountError::BadEd25519);
    require!(d[0] == 1, HeadcountError::BadEd25519);
    let rd = |i: usize| -> u16 { u16::from_le_bytes([d[i], d[i + 1]]) };
    let sig_ix = rd(4);
    let pk_off = rd(6) as usize;
    let pk_ix = rd(8);
    let msg_off = rd(10) as usize;
    let msg_len = rd(12) as usize;
    let msg_ix = rd(14);
    require!(
        sig_ix == u16::MAX && pk_ix == u16::MAX && msg_ix == u16::MAX,
        HeadcountError::BadEd25519
    );
    let pk_end = pk_off.checked_add(32).ok_or(HeadcountError::BadEd25519)?;
    let msg_end = msg_off
        .checked_add(msg_len)
        .ok_or(HeadcountError::BadEd25519)?;
    let pk = d.get(pk_off..pk_end).ok_or(HeadcountError::BadEd25519)?;
    let msg = d.get(msg_off..msg_end).ok_or(HeadcountError::BadEd25519)?;
    require!(pk == attestor.as_ref(), HeadcountError::WrongAttestor);
    require!(msg == expected.as_slice(), HeadcountError::WrongMessage);
    Ok(())
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub attestor: Pubkey,
    pub bump: u8,
}

#[account]
pub struct Poll {
    pub creator: Pubkey,
    pub poll_id: u64,
    pub reward_mint: Pubkey,
    pub reward_per_answer: u64,
    pub max_answers: u32,
    pub answers: u32,
    pub closes_at: i64,
    pub question: String,
    pub options: Vec<String>,
    pub tallies: [u32; MAX_OPTIONS],
    pub closed: bool,
    pub bump: u8,
    pub vault_bump: u8,
    pub seekers_only: bool,
    pub seeker_tallies: [u32; MAX_OPTIONS],
    pub seeker_answers: u32,
}

impl Poll {
    pub const SPACE: usize = 8
        + 32 + 8 + 32 + 8 + 4 + 4 + 8
        + 4 + MAX_QUESTION
        + 4 + MAX_OPTIONS * (4 + MAX_OPTION)
        + 4 * MAX_OPTIONS
        + 1 + 1 + 1
        + 1 + 4 * MAX_OPTIONS + 4;
}

#[account]
#[derive(InitSpace)]
pub struct Answer {
    pub poll: Pubkey,
    pub answerer: Pubkey,
    pub identity: Pubkey,
    pub tier: u8,
    pub choice: u8,
    pub answered_at: i64,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = 8 + Config::INIT_SPACE, seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetAttestor<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump, has_one = admin @ HeadcountError::NotAdmin)]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
#[instruction(poll_id: u64)]
pub struct CreatePoll<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        init, payer = creator, space = Poll::SPACE,
        seeds = [b"poll", creator.key().as_ref(), &poll_id.to_le_bytes()], bump
    )]
    pub poll: Account<'info, Poll>,
    pub reward_mint: InterfaceAccount<'info, Mint>,
    #[account(
        init, payer = creator, seeds = [b"vault", poll.key().as_ref()], bump,
        token::mint = reward_mint, token::authority = poll, token::token_program = token_program
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut, token::mint = reward_mint, token::authority = creator,
        token::token_program = token_program
    )]
    pub creator_token: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(choice: u8, identity: Pubkey)]
pub struct AnswerPoll<'info> {
    #[account(mut)]
    pub answerer: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut, seeds = [b"poll", poll.creator.as_ref(), &poll.poll_id.to_le_bytes()], bump = poll.bump,
        has_one = reward_mint
    )]
    pub poll: Account<'info, Poll>,
    #[account(
        init, payer = answerer, space = 8 + Answer::INIT_SPACE,
        seeds = [b"answer", poll.key().as_ref(), identity.as_ref()], bump
    )]
    pub answer: Account<'info, Answer>,
    pub reward_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut, seeds = [b"vault", poll.key().as_ref()], bump = poll.vault_bump,
        token::mint = reward_mint, token::authority = poll, token::token_program = token_program
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init_if_needed, payer = answerer,
        associated_token::mint = reward_mint, associated_token::authority = answerer,
        associated_token::token_program = token_program
    )]
    pub answerer_token: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: address-constrained to the instructions sysvar
    #[account(address = IX_SYSVAR_ID)]
    pub instructions: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClosePoll<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        mut, seeds = [b"poll", creator.key().as_ref(), &poll.poll_id.to_le_bytes()], bump = poll.bump,
        has_one = creator @ HeadcountError::NotCreator, has_one = reward_mint
    )]
    pub poll: Account<'info, Poll>,
    pub reward_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut, seeds = [b"vault", poll.key().as_ref()], bump = poll.vault_bump,
        token::mint = reward_mint, token::authority = poll, token::token_program = token_program
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut, token::mint = reward_mint, token::authority = creator,
        token::token_program = token_program
    )]
    pub creator_token: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[error_code]
pub enum HeadcountError {
    #[msg("Question must be 1..=160 bytes")]
    QuestionLength,
    #[msg("Poll needs 2..=6 options")]
    OptionCount,
    #[msg("Each option must be 1..=40 bytes")]
    OptionLength,
    #[msg("max_answers must be at least 1")]
    InvalidMaxAnswers,
    #[msg("reward_per_answer must be at least 1")]
    InvalidReward,
    #[msg("closes_at must be in the future")]
    InvalidCloseTime,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Poll is closed")]
    PollClosed,
    #[msg("Poll has ended")]
    PollEnded,
    #[msg("Poll has reached max answers")]
    PollFull,
    #[msg("Choice out of range")]
    InvalidChoice,
    #[msg("Attestation expired")]
    AttestationExpired,
    #[msg("Previous instruction is not an Ed25519 verify")]
    MissingEd25519,
    #[msg("Malformed Ed25519 instruction")]
    BadEd25519,
    #[msg("Attestation not signed by the configured attestor")]
    WrongAttestor,
    #[msg("Attestation message does not match answerer, identity, tier and expiry")]
    WrongMessage,
    #[msg("Only the admin may do this")]
    NotAdmin,
    #[msg("Only the creator may do this")]
    NotCreator,
    #[msg("Poll cannot be closed yet")]
    CannotCloseYet,
    #[msg("This poll only accepts Seeker phones")]
    SeekersOnly,
    #[msg("Tier must be 0 (wallet) or 1 (seeker)")]
    InvalidTier,
    #[msg("A wallet-tier identity must be the answering wallet")]
    InvalidIdentity,
}
