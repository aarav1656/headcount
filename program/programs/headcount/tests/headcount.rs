use anchor_lang::{InstructionData, ToAccountMetas};
use headcount::{accounts, instruction, HeadcountError, ATTEST_PREFIX};
use litesvm::{types::FailedTransactionMetadata, LiteSVM};
use solana_sdk::{
    clock::Clock,
    ed25519_instruction::new_ed25519_instruction_with_signature,
    instruction::{Instruction, InstructionError},
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
    let ix = Instruction {
        program_id: headcount::ID,
        accounts: accounts::InitConfig { admin: admin.pubkey(), config, system_program: system_program::ID }.to_account_metas(None),
        data: instruction::InitConfig { attestor: attestor.pubkey() }.data(),
    };
    send(&mut svm, &admin, &[], &[ix]).unwrap();
    Env { svm, admin, attestor, creator, mint, creator_token, config }
}

fn poll_pda(creator: &Pubkey, id: u64) -> Pubkey {
    Pubkey::find_program_address(&[b"poll", creator.as_ref(), &id.to_le_bytes()], &headcount::ID).0
}
fn vault_pda(poll: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"vault", poll.as_ref()], &headcount::ID).0
}

fn create_poll(e: &mut Env, id: u64, max_answers: u32, closes_at: i64) -> Result<Pubkey, FailedTransactionMetadata> {
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
        }
        .data(),
    };
    let creator = e.creator.insecure_clone();
    send(&mut e.svm, &creator, &[], &[ix]).map(|_| poll)
}

fn attest_msg(answerer: &Pubkey, sgt: &Pubkey, expires_at: i64) -> Vec<u8> {
    let mut m = ATTEST_PREFIX.to_vec();
    m.extend_from_slice(answerer.as_ref());
    m.extend_from_slice(sgt.as_ref());
    m.extend_from_slice(&expires_at.to_le_bytes());
    m
}

fn ed_ix(signer: &Keypair, msg: &[u8]) -> Instruction {
    let sig = signer.sign_message(msg);
    let sig_bytes: [u8; 64] = sig.as_ref().try_into().unwrap();
    new_ed25519_instruction_with_signature(msg, &sig_bytes, &signer.pubkey().to_bytes())
}

fn answer_ix(e: &Env, poll: &Pubkey, answerer: &Pubkey, choice: u8, sgt: Pubkey, expires_at: i64) -> Instruction {
    Instruction {
        program_id: headcount::ID,
        accounts: accounts::AnswerPoll {
            answerer: *answerer,
            config: e.config,
            poll: *poll,
            answer: Pubkey::find_program_address(&[b"answer", poll.as_ref(), sgt.as_ref()], &headcount::ID).0,
            reward_mint: e.mint,
            vault: vault_pda(poll),
            answerer_token: get_associated_token_address(answerer, &e.mint),
            instructions: SYSVAR_IX,
            token_program: spl_token::ID,
            associated_token_program: spl_associated_token_account::ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
        data: instruction::Answer { choice, sgt_mint: sgt, expires_at }.data(),
    }
}

fn fund(e: &mut Env) -> Keypair {
    let k = Keypair::new();
    e.svm.airdrop(&k.pubkey(), 10_000_000_000).unwrap();
    k
}

/// Valid attested answer: signer `attestor_key` signs the message for `msg_answerer`.
fn answer_with(
    e: &mut Env,
    poll: &Pubkey,
    wallet: &Keypair,
    sgt: Pubkey,
    choice: u8,
    attestor_key: &Keypair,
    msg_answerer: &Pubkey,
    expires_at: i64,
) -> Result<(), FailedTransactionMetadata> {
    let ed = ed_ix(attestor_key, &attest_msg(msg_answerer, &sgt, expires_at));
    let ix = answer_ix(e, poll, &wallet.pubkey(), choice, sgt, expires_at);
    send(&mut e.svm, wallet, &[], &[ed, ix])
}

fn answer_ok(e: &mut Env, poll: &Pubkey, wallet: &Keypair, sgt: Pubkey, choice: u8) -> Result<(), FailedTransactionMetadata> {
    let att = e.attestor.insecure_clone();
    answer_with(e, poll, wallet, sgt, choice, &att, &wallet.pubkey(), NOW + 600)
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
    let r = answer_with(&mut e, &poll, &w, Pubkey::new_unique(), 0, &rogue, &w.pubkey(), NOW + 600).unwrap_err();
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
    let r = answer_with(&mut e, &poll, &w, Pubkey::new_unique(), 0, &att, &other, NOW + 600).unwrap_err();
    assert_eq!(custom(&r), Some(code(HeadcountError::WrongMessage)), "{:?}", r.err);
}

#[test]
fn attestation_for_different_sgt_fails() {
    let mut e = setup();
    let poll = create_poll(&mut e, 1, 5, NOW + 3600).unwrap();
    let w = fund(&mut e);
    let att = e.attestor.insecure_clone();
    let signed_sgt = Pubkey::new_unique();
    let ed = ed_ix(&att, &attest_msg(&w.pubkey(), &signed_sgt, NOW + 600));
    let ix = answer_ix(&e, &poll, &w.pubkey(), 0, Pubkey::new_unique(), NOW + 600);
    let r = send(&mut e.svm, &w, &[], &[ed, ix]).unwrap_err();
    assert_eq!(custom(&r), Some(code(HeadcountError::WrongMessage)), "{:?}", r.err);
}

#[test]
fn expired_attestation_fails() {
    let mut e = setup();
    let poll = create_poll(&mut e, 1, 5, NOW + 3600).unwrap();
    let w = fund(&mut e);
    let att = e.attestor.insecure_clone();
    let r = answer_with(&mut e, &poll, &w, Pubkey::new_unique(), 0, &att, &w.pubkey(), NOW - 1).unwrap_err();
    assert_eq!(custom(&r), Some(code(HeadcountError::AttestationExpired)), "{:?}", r.err);
    // and one that expires while the poll is open: clock passes expires_at
    let sgt = Pubkey::new_unique();
    let ed = ed_ix(&att, &attest_msg(&w.pubkey(), &sgt, NOW + 100));
    let ix = answer_ix(&e, &poll, &w.pubkey(), 0, sgt, NOW + 100);
    set_clock(&mut e.svm, NOW + 100);
    let r = send(&mut e.svm, &w, &[], &[ed, ix]).unwrap_err();
    assert_eq!(custom(&r), Some(code(HeadcountError::AttestationExpired)), "{:?}", r.err);
}

#[test]
fn missing_ed25519_instruction_fails() {
    let mut e = setup();
    let poll = create_poll(&mut e, 1, 5, NOW + 3600).unwrap();
    let w = fund(&mut e);
    let ix = answer_ix(&e, &poll, &w.pubkey(), 0, Pubkey::new_unique(), NOW + 600);
    let r = send(&mut e.svm, &w, &[], &[ix]).unwrap_err();
    assert_eq!(custom(&r), Some(code(HeadcountError::MissingEd25519)), "{:?}", r.err);

    // ed25519 ix present but not immediately before: a no-op sits between
    let att = e.attestor.insecure_clone();
    let sgt = Pubkey::new_unique();
    let ed = ed_ix(&att, &attest_msg(&w.pubkey(), &sgt, NOW + 600));
    let pad = solana_sdk::system_instruction::transfer(&w.pubkey(), &w.pubkey(), 1);
    let ix = answer_ix(&e, &poll, &w.pubkey(), 0, sgt, NOW + 600);
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
    let mut ed = ed_ix(&att, &attest_msg(&w.pubkey(), &sgt, NOW + 600));
    for off in [4usize, 8, 14] {
        ed.data[off..off + 2].copy_from_slice(&0u16.to_le_bytes());
    }
    // ed25519 ix at index 0 now self-references index 0
    let ix = answer_ix(&e, &poll, &w.pubkey(), 0, sgt, NOW + 600);
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
    answer_with(&mut e, &poll, &w, Pubkey::new_unique(), 0, &new_att, &w.pubkey(), NOW + 600).unwrap();
}
