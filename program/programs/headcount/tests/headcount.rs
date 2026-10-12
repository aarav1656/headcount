use anchor_lang::{InstructionData, ToAccountMetas};
use headcount::{accounts, instruction, HeadcountError, ATTEST_PREFIX, TIER_SEEKER, TIER_WALLET};
use litesvm::{types::FailedTransactionMetadata, LiteSVM};
use solana_sdk::{
    clock::Clock,
    ed25519_instruction::new_ed25519_instruction_with_signature,
    instruction::{AccountMeta, Instruction, InstructionError},
    program_option::COption,
    program_pack::Pack,
    pubkey::Pubkey,
    signature::Keypair,
    signer::Signer,
    system_program,
    transaction::{Transaction, TransactionError},
};
use spl_associated_token_account::get_associated_token_address;

const REWARD: u64 = 5_000_000;
const NOW: i64 = 1_000_000;
const SYSVAR_IX: Pubkey = solana_sdk::sysvar::instructions::ID;

fn code(e: HeadcountError) -> u32 {
    6000 + e as u32
}

fn custom(f: &FailedTransactionMetadata) -> Option<u32> {
    match &f.err {
        TransactionError::InstructionError(_, InstructionError::Custom(c)) => Some(*c),
        _ => None,
    }
}

struct Env {
    svm: LiteSVM,
    admin: Keypair,
    attestor: Keypair,
    creator: Keypair,
    mint: Pubkey,
    creator_token: Pubkey,
    config: Pubkey,
}

fn set_clock(svm: &mut LiteSVM, ts: i64) {
    let mut c = svm.get_sysvar::<Clock>();
    c.unix_timestamp = ts;
    svm.set_sysvar(&c);
}

fn send(svm: &mut LiteSVM, payer: &Keypair, extra: &[&Keypair], ixs: &[Instruction]) -> Result<(), FailedTransactionMetadata> {
    svm.expire_blockhash();
    let mut signers: Vec<&Keypair> = vec![payer];
    signers.extend_from_slice(extra);
    let tx = Transaction::new_signed_with_payer(ixs, Some(&payer.pubkey()), &signers, svm.latest_blockhash());
    svm.send_transaction(tx).map(|_| ())
}

fn token_balance(svm: &LiteSVM, ta: &Pubkey) -> Option<u64> {
    let a = svm.get_account(ta)?;
    if a.data.is_empty() {
        return None;
    }
    Some(spl_token::state::Account::unpack(&a.data).ok()?.amount)
}

fn set_token_account(svm: &mut LiteSVM, addr: Pubkey, mint: Pubkey, owner: Pubkey, amount: u64) {
    let mut data = vec![0u8; spl_token::state::Account::LEN];
    spl_token::state::Account::pack(
        spl_token::state::Account {
            mint,
            owner,
            amount,
            delegate: COption::None,
            state: spl_token::state::AccountState::Initialized,
            is_native: COption::None,
            delegated_amount: 0,
            close_authority: COption::None,
        },
        &mut data,
    )
    .unwrap();
    svm.set_account(
        addr,
        solana_sdk::account::Account {
            lamports: svm.minimum_balance_for_rent_exemption(data.len()),
            data,
            owner: spl_token::ID,
            executable: false,
            rent_epoch: 0,
        },
    )
    .unwrap();
}

fn setup() -> Env {
    setup_uninitialized(true)
}

fn setup_uninitialized(initialize: bool) -> Env {
    let mut svm = LiteSVM::new();
    svm.add_program_from_file(headcount::ID, "../../target/deploy/headcount.so")
        .expect("run `anchor build` first");
    set_clock(&mut svm, NOW);
    let admin = Keypair::new();
    let attestor = Keypair::new();
    let creator = Keypair::new();
    for k in [&admin, &creator] {
        svm.airdrop(&k.pubkey(), 100_000_000_000).unwrap();
    }

    let mint = Pubkey::new_unique();
    let mut data = vec![0u8; spl_token::state::Mint::LEN];
    spl_token::state::Mint::pack(
        spl_token::state::Mint {
            mint_authority: COption::None,
            supply: 1_000_000_000_000,
            decimals: 6,
            is_initialized: true,
            freeze_authority: COption::None,
        },
        &mut data,
    )
    .unwrap();
    svm.set_account(
        mint,
        solana_sdk::account::Account {
            lamports: svm.minimum_balance_for_rent_exemption(data.len()),
            data,
            owner: spl_token::ID,
            executable: false,
            rent_epoch: 0,
        },
    )
    .unwrap();
    let creator_token = get_associated_token_address(&creator.pubkey(), &mint);
    set_token_account(&mut svm, creator_token, mint, creator.pubkey(), 1_000_000_000);

    let config = Pubkey::find_program_address(&[b"config"], &headcount::ID).0;
    let program_data = program_data_address();
    let program_bytes = std::fs::read("../../target/deploy/headcount.so").unwrap();
    let mut data = 3u32.to_le_bytes().to_vec();
    data.extend_from_slice(&0u64.to_le_bytes());
    data.push(1);
    data.extend_from_slice(admin.pubkey().as_ref());
    data.extend_from_slice(&program_bytes);
    svm.set_account(program_data, solana_sdk::account::Account {
        lamports: svm.minimum_balance_for_rent_exemption(data.len()),
        data,
        owner: anchor_lang::solana_program::bpf_loader_upgradeable::ID,
        executable: false,
        rent_epoch: 0,
    }).unwrap();
    let mut data = 2u32.to_le_bytes().to_vec();
    data.extend_from_slice(program_data.as_ref());
    svm.set_account(headcount::ID, solana_sdk::account::Account {
        lamports: svm.minimum_balance_for_rent_exemption(data.len()),
        data,
        owner: anchor_lang::solana_program::bpf_loader_upgradeable::ID,
        executable: true,
        rent_epoch: 0,
    }).unwrap();
    if initialize {
        let ix = init_config_ix(admin.pubkey(), config, attestor.pubkey(), program_data);
        send(&mut svm, &admin, &[], &[ix]).unwrap();
    }
    Env { svm, admin, attestor, creator, mint, creator_token, config }
}

fn poll_pda(creator: &Pubkey, id: u64) -> Pubkey {
    Pubkey::find_program_address(&[b"poll", creator.as_ref(), &id.to_le_bytes()], &headcount::ID).0
}
fn vault_pda(poll: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"vault", poll.as_ref()], &headcount::ID).0
}

fn create_poll(e: &mut Env, id: u64, max_answers: u32, closes_at: i64) -> Result<Pubkey, FailedTransactionMetadata> {
    create_poll_with(e, id, max_answers, closes_at, false)
}

fn create_poll_with(
    e: &mut Env,
    id: u64,
    max_answers: u32,
    closes_at: i64,
    seekers_only: bool,
) -> Result<Pubkey, FailedTransactionMetadata> {
    let poll = poll_pda(&e.creator.pubkey(), id);
    let ix = Instruction {
        program_id: headcount::ID,
        accounts: accounts::CreatePoll {
            creator: e.creator.pubkey(),
            poll,
            reward_mint: e.mint,
            vault: vault_pda(&poll),
            creator_token: e.creator_token,
            token_program: spl_token::ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
        data: instruction::CreatePoll {
            poll_id: id,
            question: "Which chain do you ship on?".into(),
            options: vec!["Solana".into(), "Other".into(), "None".into()],
            reward_per_answer: REWARD,
            max_answers,
            closes_at,
            seekers_only,
        }
        .data(),
    };
    let creator = e.creator.insecure_clone();
    send(&mut e.svm, &creator, &[], &[ix]).map(|_| poll)
}

fn attest_msg(answerer: &Pubkey, identity: &Pubkey, tier: u8, expires_at: i64) -> Vec<u8> {
    let mut m = ATTEST_PREFIX.to_vec();
    m.extend_from_slice(answerer.as_ref());
    m.extend_from_slice(identity.as_ref());
    m.push(tier);
    m.extend_from_slice(&expires_at.to_le_bytes());
    m
}

fn ed_ix(signer: &Keypair, msg: &[u8]) -> Instruction {
    let sig = signer.sign_message(msg);
    let sig_bytes: [u8; 64] = sig.as_ref().try_into().unwrap();
    new_ed25519_instruction_with_signature(msg, &sig_bytes, &signer.pubkey().to_bytes())
}

fn answer_ix(
    e: &Env,
    poll: &Pubkey,
    answerer: &Pubkey,
    choice: u8,
    identity: Pubkey,
    tier: u8,
    expires_at: i64,
) -> Instruction {
    Instruction {
        program_id: headcount::ID,
        accounts: accounts::AnswerPoll {
            answerer: *answerer,
            config: e.config,
            poll: *poll,
            answer: Pubkey::find_program_address(&[b"answer", poll.as_ref(), identity.as_ref()], &headcount::ID).0,
            reward_mint: e.mint,
            vault: vault_pda(poll),
            answerer_token: get_associated_token_address(answerer, &e.mint),
            instructions: SYSVAR_IX,
            token_program: spl_token::ID,
            associated_token_program: spl_associated_token_account::ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
        data: instruction::Answer { choice, identity, tier, expires_at }.data(),
    }
}

fn fund(e: &mut Env) -> Keypair {
    let k = Keypair::new();
    e.svm.airdrop(&k.pubkey(), 10_000_000_000).unwrap();
    k
}

/// Attested answer: signer `attestor_key` signs the message for `msg_answerer`.
fn answer_with(
    e: &mut Env,
    poll: &Pubkey,
    wallet: &Keypair,
    identity: Pubkey,
    tier: u8,
    choice: u8,
    attestor_key: &Keypair,
    msg_answerer: &Pubkey,
    expires_at: i64,
) -> Result<(), FailedTransactionMetadata> {
    let ed = ed_ix(attestor_key, &attest_msg(msg_answerer, &identity, tier, expires_at));
    let ix = answer_ix(e, poll, &wallet.pubkey(), choice, identity, tier, expires_at);
    send(&mut e.svm, wallet, &[], &[ed, ix])
}

/// Seeker-tier answer: identity is the SGT mint.
fn answer_ok(e: &mut Env, poll: &Pubkey, wallet: &Keypair, sgt: Pubkey, choice: u8) -> Result<(), FailedTransactionMetadata> {
    let att = e.attestor.insecure_clone();
    answer_with(e, poll, wallet, sgt, TIER_SEEKER, choice, &att, &wallet.pubkey(), NOW + 600)
}

/// Wallet-tier answer: identity is the answering wallet itself.
fn wallet_ok(e: &mut Env, poll: &Pubkey, wallet: &Keypair, choice: u8) -> Result<(), FailedTransactionMetadata> {
    let att = e.attestor.insecure_clone();
    answer_with(e, poll, wallet, wallet.pubkey(), TIER_WALLET, choice, &att, &wallet.pubkey(), NOW + 600)
}

fn answer_state(e: &Env, poll: &Pubkey, identity: &Pubkey) -> Option<headcount::Answer> {
    use anchor_lang::AccountDeserialize;
    let addr = Pubkey::find_program_address(&[b"answer", poll.as_ref(), identity.as_ref()], &headcount::ID).0;
    let a = e.svm.get_account(&addr)?;
    if a.data.is_empty() {
        return None;
    }
    headcount::Answer::try_deserialize(&mut a.data.as_slice()).ok()
}

fn poll_state(e: &Env, poll: &Pubkey) -> headcount::Poll {
    use anchor_lang::AccountDeserialize;
    let a = e.svm.get_account(poll).unwrap();
    headcount::Poll::try_deserialize(&mut a.data.as_slice()).unwrap()
}

#[test]
fn happy_path_create_answer_tally_and_payout() {
    let mut e = setup();
    let poll = create_poll(&mut e, 1, 3, NOW + 3600).unwrap();
    assert_eq!(token_balance(&e.svm, &vault_pda(&poll)), Some(REWARD * 3));
    assert_eq!(token_balance(&e.svm, &e.creator_token), Some(1_000_000_000 - REWARD * 3));

    let w = fund(&mut e);
    let sgt = Pubkey::new_unique();
    assert_eq!(token_balance(&e.svm, &get_associated_token_address(&w.pubkey(), &e.mint)), None);
    answer_ok(&mut e, &poll, &w, sgt, 1).unwrap();

    let p = poll_state(&e, &poll);
    assert_eq!(p.answers, 1);
    assert_eq!(p.tallies, [0, 1, 0, 0, 0, 0]);
    assert_eq!(p.seeker_tallies, [0, 1, 0, 0, 0, 0]);
    assert_eq!(p.seeker_answers, 1);
    assert!(!p.seekers_only);
    let a = answer_state(&e, &poll, &sgt).expect("answer account");
    assert_eq!((a.tier, a.identity, a.answerer, a.choice), (TIER_SEEKER, sgt, w.pubkey(), 1));
    assert_eq!(token_balance(&e.svm, &get_associated_token_address(&w.pubkey(), &e.mint)), Some(REWARD));
    assert_eq!(token_balance(&e.svm, &vault_pda(&poll)), Some(REWARD * 2));
}

#[test]
fn same_sgt_answering_twice_fails() {
    let mut e = setup();
    let poll = create_poll(&mut e, 1, 5, NOW + 3600).unwrap();
    let sgt = Pubkey::new_unique();
    let w1 = fund(&mut e);
    answer_ok(&mut e, &poll, &w1, sgt, 0).unwrap();
    // same wallet again
    let r = answer_ok(&mut e, &poll, &w1, sgt, 0).unwrap_err();
    assert!(r.meta.logs.iter().any(|l| l.contains("already in use")), "{:?}", r.meta.logs);
    // different wallet, same device token
    let w2 = fund(&mut e);
    let r = answer_ok(&mut e, &poll, &w2, sgt, 1).unwrap_err();
    assert!(r.meta.logs.iter().any(|l| l.contains("already in use")), "{:?}", r.meta.logs);
    let p = poll_state(&e, &poll);
    assert_eq!((p.answers, p.tallies[0], p.tallies[1]), (1, 1, 0));
}

#[test]
fn attestation_by_non_attestor_fails() {
    let mut e = setup();
    let poll = create_poll(&mut e, 1, 5, NOW + 3600).unwrap();
    let w = fund(&mut e);
    let rogue = Keypair::new();
    let r = answer_with(&mut e, &poll, &w, Pubkey::new_unique(), TIER_SEEKER, 0, &rogue, &w.pubkey(), NOW + 600).unwrap_err();
    assert_eq!(custom(&r), Some(code(HeadcountError::WrongAttestor)), "{:?}", r.err);
    assert_eq!(poll_state(&e, &poll).answers, 0);
}

#[test]
fn attestation_for_different_answerer_fails() {
    let mut e = setup();
    let poll = create_poll(&mut e, 1, 5, NOW + 3600).unwrap();
    let w = fund(&mut e);
    let other = Pubkey::new_unique();
    let att = e.attestor.insecure_clone();
    let r = answer_with(&mut e, &poll, &w, Pubkey::new_unique(), TIER_SEEKER, 0, &att, &other, NOW + 600).unwrap_err();
    assert_eq!(custom(&r), Some(code(HeadcountError::WrongMessage)), "{:?}", r.err);
}

#[test]
fn attestation_for_different_sgt_fails() {
    let mut e = setup();
    let poll = create_poll(&mut e, 1, 5, NOW + 3600).unwrap();
    let w = fund(&mut e);
    let att = e.attestor.insecure_clone();
    let signed_sgt = Pubkey::new_unique();
    let ed = ed_ix(&att, &attest_msg(&w.pubkey(), &signed_sgt, TIER_SEEKER, NOW + 600));
    let ix = answer_ix(&e, &poll, &w.pubkey(), 0, Pubkey::new_unique(), TIER_SEEKER, NOW + 600);
    let r = send(&mut e.svm, &w, &[], &[ed, ix]).unwrap_err();
    assert_eq!(custom(&r), Some(code(HeadcountError::WrongMessage)), "{:?}", r.err);
}

#[test]
fn expired_attestation_fails() {
    let mut e = setup();
    let poll = create_poll(&mut e, 1, 5, NOW + 3600).unwrap();
    let w = fund(&mut e);
    let att = e.attestor.insecure_clone();
    let r = answer_with(&mut e, &poll, &w, Pubkey::new_unique(), TIER_SEEKER, 0, &att, &w.pubkey(), NOW - 1).unwrap_err();
    assert_eq!(custom(&r), Some(code(HeadcountError::AttestationExpired)), "{:?}", r.err);
    // and one that expires while the poll is open: clock passes expires_at
    let sgt = Pubkey::new_unique();
    let ed = ed_ix(&att, &attest_msg(&w.pubkey(), &sgt, TIER_SEEKER, NOW + 100));
    let ix = answer_ix(&e, &poll, &w.pubkey(), 0, sgt, TIER_SEEKER, NOW + 100);
    set_clock(&mut e.svm, NOW + 100);
    let r = send(&mut e.svm, &w, &[], &[ed, ix]).unwrap_err();
    assert_eq!(custom(&r), Some(code(HeadcountError::AttestationExpired)), "{:?}", r.err);
}

#[test]
fn missing_ed25519_instruction_fails() {
    let mut e = setup();
    let poll = create_poll(&mut e, 1, 5, NOW + 3600).unwrap();
    let w = fund(&mut e);
    let ix = answer_ix(&e, &poll, &w.pubkey(), 0, Pubkey::new_unique(), TIER_SEEKER, NOW + 600);
    let r = send(&mut e.svm, &w, &[], &[ix]).unwrap_err();
    assert_eq!(custom(&r), Some(code(HeadcountError::MissingEd25519)), "{:?}", r.err);

    // ed25519 ix present but not immediately before: a no-op sits between
    let att = e.attestor.insecure_clone();
    let sgt = Pubkey::new_unique();
    let ed = ed_ix(&att, &attest_msg(&w.pubkey(), &sgt, TIER_SEEKER, NOW + 600));
    let pad = solana_sdk::system_instruction::transfer(&w.pubkey(), &w.pubkey(), 1);
    let ix = answer_ix(&e, &poll, &w.pubkey(), 0, sgt, TIER_SEEKER, NOW + 600);
    let r = send(&mut e.svm, &w, &[], &[ed, pad, ix]).unwrap_err();
    assert_eq!(custom(&r), Some(code(HeadcountError::MissingEd25519)), "{:?}", r.err);
}

#[test]
fn ed25519_offsets_pointing_at_other_instruction_fail() {
    let mut e = setup();
    let poll = create_poll(&mut e, 1, 5, NOW + 3600).unwrap();
    let w = fund(&mut e);
    let sgt = Pubkey::new_unique();
    let att = e.attestor.insecure_clone();
    // Offsets claim instruction 0 instead of u16::MAX. The runtime accepts it; we must not.
    let mut ed = ed_ix(&att, &attest_msg(&w.pubkey(), &sgt, TIER_SEEKER, NOW + 600));
    for off in [4usize, 8, 14] {
        ed.data[off..off + 2].copy_from_slice(&0u16.to_le_bytes());
    }
    // ed25519 ix at index 0 now self-references index 0
    let ix = answer_ix(&e, &poll, &w.pubkey(), 0, sgt, TIER_SEEKER, NOW + 600);
    let r = send(&mut e.svm, &w, &[], &[ed, ix]).unwrap_err();
    assert_eq!(custom(&r), Some(code(HeadcountError::BadEd25519)), "{:?}", r.err);
}

#[test]
fn answer_after_max_answers_fails_and_close_refunds_remainder() {
    let mut e = setup();
    // poll A: full after two answers
    let full = create_poll(&mut e, 1, 2, NOW + 3600).unwrap();
    for c in [0u8, 1] {
        let w = fund(&mut e);
        answer_ok(&mut e, &full, &w, Pubkey::new_unique(), c).unwrap();
    }
    let w3 = fund(&mut e);
    let r = answer_ok(&mut e, &full, &w3, Pubkey::new_unique(), 0).unwrap_err();
    assert_eq!(custom(&r), Some(code(HeadcountError::PollFull)), "{:?}", r.err);
    assert_eq!(token_balance(&e.svm, &vault_pda(&full)), Some(0));

    // poll B: 1 of 3 answered, remainder refunded after the deadline
    let poll = create_poll(&mut e, 2, 3, NOW + 3600).unwrap();
    let w = fund(&mut e);
    answer_ok(&mut e, &poll, &w, Pubkey::new_unique(), 2).unwrap();
    let before = token_balance(&e.svm, &e.creator_token).unwrap();

    let (c_pk, c_mint, c_tok) = (e.creator.pubkey(), e.mint, e.creator_token);
    let close = move |poll: &Pubkey| Instruction {
        program_id: headcount::ID,
        accounts: accounts::ClosePoll {
            creator: c_pk,
            poll: *poll,
            reward_mint: c_mint,
            vault: vault_pda(poll),
            creator_token: c_tok,
            token_program: spl_token::ID,
        }
        .to_account_metas(None),
        data: instruction::ClosePoll {}.data(),
    };
    let creator = e.creator.insecure_clone();
    let r = send(&mut e.svm, &creator, &[], &[close(&poll)]).unwrap_err();
    assert_eq!(custom(&r), Some(code(HeadcountError::CannotCloseYet)), "{:?}", r.err);

    // a stranger cannot close it either
    let stranger = fund(&mut e);
    let mut bad = close(&poll);
    bad.accounts[0].pubkey = stranger.pubkey();
    assert!(send(&mut e.svm, &stranger, &[], &[bad]).is_err());

    set_clock(&mut e.svm, NOW + 3600);
    send(&mut e.svm, &creator, &[], &[close(&poll)]).unwrap();
    assert_eq!(token_balance(&e.svm, &e.creator_token), Some(before + REWARD * 2));
    assert!(poll_state(&e, &poll).closed);
    assert!(e.svm.get_account(&vault_pda(&poll)).map_or(true, |a| a.lamports == 0));

    // closed poll takes no more answers
    let late = fund(&mut e);
    assert!(answer_ok(&mut e, &poll, &late, Pubkey::new_unique(), 0).is_err());

    // full poll can be closed early by answers == max
    send(&mut e.svm, &creator, &[], &[close(&full)]).unwrap();
}

#[test]
fn create_poll_validation_and_set_attestor_admin_only() {
    let mut e = setup();
    assert!(create_poll(&mut e, 1, 0, NOW + 3600).is_err());
    assert!(create_poll(&mut e, 2, 1, NOW).is_err());
    let r = create_poll(&mut e, 3, u32::MAX, NOW + 3600);
    assert!(r.is_err(), "reward * max_answers exceeds balance or overflows");

    let new_att = Keypair::new();
    let cfg = e.config;
    let set = |signer: &Pubkey| Instruction {
        program_id: headcount::ID,
        accounts: accounts::SetAttestor { admin: *signer, config: cfg }.to_account_metas(None),
        data: instruction::SetAttestor { attestor: new_att.pubkey() }.data(),
    };
    let stranger = fund(&mut e);
    let r = send(&mut e.svm, &stranger, &[], &[set(&stranger.pubkey())]).unwrap_err();
    assert_eq!(custom(&r), Some(code(HeadcountError::NotAdmin)), "{:?}", r.err);
    let admin = e.admin.insecure_clone();
    send(&mut e.svm, &admin, &[], &[set(&admin.pubkey())]).unwrap();

    // old attestor no longer accepted
    let poll = create_poll(&mut e, 4, 2, NOW + 3600).unwrap();
    let w = fund(&mut e);
    let r = answer_ok(&mut e, &poll, &w, Pubkey::new_unique(), 0).unwrap_err();
    assert_eq!(custom(&r), Some(code(HeadcountError::WrongAttestor)), "{:?}", r.err);
    answer_with(&mut e, &poll, &w, Pubkey::new_unique(), TIER_SEEKER, 0, &new_att, &w.pubkey(), NOW + 600).unwrap();
}

#[test]
fn wallet_tier_answering_open_poll_is_paid() {
    let mut e = setup();
    let poll = create_poll(&mut e, 1, 3, NOW + 3600).unwrap();
    let w = fund(&mut e);
    let ata = get_associated_token_address(&w.pubkey(), &e.mint);
    assert_eq!(token_balance(&e.svm, &ata), None);
    wallet_ok(&mut e, &poll, &w, 2).unwrap();
    assert_eq!(token_balance(&e.svm, &ata), Some(REWARD));
    assert_eq!(token_balance(&e.svm, &vault_pda(&poll)), Some(REWARD * 2));
    let a = answer_state(&e, &poll, &w.pubkey()).expect("answer account seeded by the wallet");
    assert_eq!((a.tier, a.identity, a.answerer, a.choice), (TIER_WALLET, w.pubkey(), w.pubkey(), 2));
}

#[test]
fn wallet_tier_on_seekers_only_poll_fails_and_seeker_tier_succeeds() {
    let mut e = setup();
    let poll = create_poll_with(&mut e, 1, 3, NOW + 3600, true).unwrap();
    assert!(poll_state(&e, &poll).seekers_only);

    let w = fund(&mut e);
    let ata = get_associated_token_address(&w.pubkey(), &e.mint);
    let r = wallet_ok(&mut e, &poll, &w, 0).unwrap_err();
    assert_eq!(custom(&r), Some(code(HeadcountError::SeekersOnly)), "{:?}", r.err);
    let p = poll_state(&e, &poll);
    assert_eq!((p.answers, p.seeker_answers, p.tallies, p.seeker_tallies), (0, 0, [0; 6], [0; 6]));
    assert_eq!(token_balance(&e.svm, &ata), None);
    assert!(answer_state(&e, &poll, &w.pubkey()).is_none());
    assert_eq!(token_balance(&e.svm, &vault_pda(&poll)), Some(REWARD * 3));

    // the same wallet, attested as a seeker, is accepted on the same poll
    let sgt = Pubkey::new_unique();
    answer_ok(&mut e, &poll, &w, sgt, 1).unwrap();
    let p = poll_state(&e, &poll);
    assert_eq!((p.answers, p.seeker_answers, p.tallies[1], p.seeker_tallies[1]), (1, 1, 1, 1));
    assert_eq!(token_balance(&e.svm, &ata), Some(REWARD));
}

#[test]
fn seeker_answer_counts_in_both_tallies_and_wallet_answer_only_in_overall() {
    let mut e = setup();
    let poll = create_poll(&mut e, 1, 10, NOW + 3600).unwrap();

    let s = fund(&mut e);
    answer_ok(&mut e, &poll, &s, Pubkey::new_unique(), 0).unwrap();
    let p = poll_state(&e, &poll);
    assert_eq!((p.answers, p.seeker_answers), (1, 1));
    assert_eq!((p.tallies, p.seeker_tallies), ([1, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0]));

    for choice in [1u8, 1, 2] {
        let w = fund(&mut e);
        wallet_ok(&mut e, &poll, &w, choice).unwrap();
    }
    let p = poll_state(&e, &poll);
    assert_eq!((p.answers, p.seeker_answers), (4, 1));
    assert_eq!(p.tallies, [1, 2, 1, 0, 0, 0]);
    assert_eq!(p.seeker_tallies, [1, 0, 0, 0, 0, 0]);

    let s2 = fund(&mut e);
    answer_ok(&mut e, &poll, &s2, Pubkey::new_unique(), 2).unwrap();
    let p = poll_state(&e, &poll);
    assert_eq!((p.answers, p.seeker_answers), (5, 2));
    assert_eq!(p.tallies, [1, 2, 2, 0, 0, 0]);
    assert_eq!(p.seeker_tallies, [1, 0, 1, 0, 0, 0]);
}

#[test]
fn same_identity_twice_fails_for_both_tiers() {
    let mut e = setup();
    let poll = create_poll(&mut e, 1, 10, NOW + 3600).unwrap();

    let w = fund(&mut e);
    wallet_ok(&mut e, &poll, &w, 0).unwrap();
    let r = wallet_ok(&mut e, &poll, &w, 1).unwrap_err();
    assert!(r.meta.logs.iter().any(|l| l.contains("already in use")), "{:?}", r.meta.logs);

    let sgt = Pubkey::new_unique();
    let s1 = fund(&mut e);
    answer_ok(&mut e, &poll, &s1, sgt, 0).unwrap();
    let s2 = fund(&mut e);
    let r = answer_ok(&mut e, &poll, &s2, sgt, 1).unwrap_err();
    assert!(r.meta.logs.iter().any(|l| l.contains("already in use")), "{:?}", r.meta.logs);

    let p = poll_state(&e, &poll);
    assert_eq!((p.answers, p.seeker_answers, p.tallies), (2, 1, [2, 0, 0, 0, 0, 0]));
}

#[test]
fn attested_tier_cannot_be_upgraded_and_tier_rules_hold() {
    let mut e = setup();
    let seekers = create_poll_with(&mut e, 1, 5, NOW + 3600, true).unwrap();
    let att = e.attestor.insecure_clone();
    let w = fund(&mut e);

    // attestor signed tier 0, the wallet claims tier 1 to get into a seekers-only poll
    let ed = ed_ix(&att, &attest_msg(&w.pubkey(), &w.pubkey(), TIER_WALLET, NOW + 600));
    let ix = answer_ix(&e, &seekers, &w.pubkey(), 0, w.pubkey(), TIER_SEEKER, NOW + 600);
    let r = send(&mut e.svm, &w, &[], &[ed, ix]).unwrap_err();
    assert_eq!(custom(&r), Some(code(HeadcountError::WrongMessage)), "{:?}", r.err);

    // tier outside {0,1}
    let r = answer_with(&mut e, &seekers, &w, w.pubkey(), 2, 0, &att, &w.pubkey(), NOW + 600).unwrap_err();
    assert_eq!(custom(&r), Some(code(HeadcountError::InvalidTier)), "{:?}", r.err);

    // wallet tier must use the answering wallet as identity, even if the attestor signed another
    let open = create_poll(&mut e, 2, 5, NOW + 3600).unwrap();
    let r = answer_with(&mut e, &open, &w, Pubkey::new_unique(), TIER_WALLET, 0, &att, &w.pubkey(), NOW + 600).unwrap_err();
    assert_eq!(custom(&r), Some(code(HeadcountError::InvalidIdentity)), "{:?}", r.err);
    assert_eq!(poll_state(&e, &open).answers, 0);
    assert_eq!(poll_state(&e, &seekers).answers, 0);
}

fn program_data_address() -> Pubkey {
    Pubkey::find_program_address(
        &[headcount::ID.as_ref()],
        &anchor_lang::solana_program::bpf_loader_upgradeable::ID,
    ).0
}

fn init_config_ix(admin: Pubkey, config: Pubkey, attestor: Pubkey, program_data: Pubkey) -> Instruction {
    Instruction {
        program_id: headcount::ID,
        accounts: vec![
            AccountMeta::new(admin, true),
            AccountMeta::new(config, false),
            AccountMeta::new_readonly(system_program::ID, false),
            AccountMeta::new_readonly(program_data, false),
        ],
        data: instruction::InitConfig { attestor }.data(),
    }
}

#[test]
fn unauthorized_bootstrap_cannot_install_attestor_and_drain_vault() {
    let mut e = setup_uninitialized(false);
    let attacker = fund(&mut e);
    let ix = init_config_ix(attacker.pubkey(), e.config, attacker.pubkey(), program_data_address());
    let result = send(&mut e.svm, &attacker, &[], &[ix]);
    if result.is_ok() {
        let poll = create_poll_with(&mut e, 99, 2, NOW + 3600, true).unwrap();
        for _ in 0..2 {
            let identity = Pubkey::new_unique();
            answer_with(&mut e, &poll, &attacker, identity, TIER_SEEKER, 0,
                &attacker, &attacker.pubkey(), NOW + 600).unwrap();
        }
        assert_eq!(token_balance(&e.svm, &vault_pda(&poll)), Some(0));
        assert_eq!(token_balance(&e.svm, &get_associated_token_address(&attacker.pubkey(), &e.mint)), Some(REWARD * 2));
    }
    let rejected = result.expect_err("unauthorized bootstrap installed an attacker attestor and drained the vault");
    assert_eq!(custom(&rejected), Some(code(HeadcountError::NotAdmin)));
    assert!(e.svm.get_account(&e.config).map_or(true, |a| a.data.is_empty()));
    let admin = e.admin.insecure_clone();
    let ix = init_config_ix(admin.pubkey(), e.config, e.attestor.pubkey(), program_data_address());
    send(&mut e.svm, &admin, &[], &[ix]).unwrap();
}
