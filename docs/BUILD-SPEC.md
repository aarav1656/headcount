# Headcount build spec

Headcount: polls where every answer comes from a distinct Seeker phone. A project funds a poll with SKR or USDC, every Seeker owner answers once per device and is paid instantly, and the creator sees results no bot farm can move.

Uniqueness key is the Seeker Genesis Token (SGT) mint, not the wallet. One SGT = one device = one answer, enforced on-chain by the Answer PDA seed.

## Layout

```
program/   Anchor 0.32 workspace, program name `headcount`, devnet
api/       Vercel functions (Node 24, TypeScript): attestor
app/       Expo SDK 55 app (from solana-foundation kit-expo-minimal template)
```

## Program `headcount`

Accounts:

- `Config` PDA `["config"]`: `admin: Pubkey`, `attestor: Pubkey`, `bump`.
- `Poll` PDA `["poll", creator, poll_id.to_le_bytes()]`:
  `creator, poll_id: u64, reward_mint: Pubkey, reward_per_answer: u64, max_answers: u32, answers: u32, closes_at: i64, question: String (max 160 bytes), options: Vec<String> (2..=6, each max 40 bytes), tallies: [u32; 6], closed: bool, bump, vault_bump`.
- Vault: token account PDA `["vault", poll]`, authority = poll PDA. Works for SPL Token and Token-2022 mints (use `token_interface`).
- `Answer` PDA `["answer", poll, sgt_mint]`: `poll, answerer, sgt_mint, choice: u8, answered_at: i64, bump`.

Instructions:

1. `init_config(attestor)`: one time, payer becomes admin.
2. `set_attestor(attestor)`: admin only.
3. `create_poll(poll_id, question, options, reward_per_answer, max_answers, closes_at)`: validates lengths, `closes_at > now`, `max_answers >= 1`; transfers `reward_per_answer * max_answers` (checked_mul) from creator token account into vault.
4. `answer(choice, sgt_mint, expires_at)`:
   - poll open (`!closed`, `now < closes_at`, `answers < max_answers`), `choice < options.len()`.
   - The instruction immediately before this one in the transaction MUST be an Ed25519 program instruction (`Ed25519SigVerify111111111111111111111111111`) with exactly 1 signature, whose pubkey == `config.attestor` and whose message == `b"headcount:v1" || answerer (32) || sgt_mint (32) || expires_at (i64 LE)`. Read it via the instructions sysvar. Reject offsets that point at a different instruction (all `*_instruction_index` must be `u16::MAX`). `now < expires_at`.
   - `init` Answer PDA (second answer from the same SGT fails with account-in-use).
   - `tallies[choice] += 1`, `answers += 1`.
   - transfer `reward_per_answer` from vault to answerer token account (`init_if_needed` ATA), signed by poll PDA.
5. `close_poll()`: creator only, allowed when `now >= closes_at` or `answers == max_answers`; returns remaining vault balance to creator, sets `closed = true`.

Errors are a named `#[error_code]` enum. No `unwrap()` on user input. Every arithmetic op checked.

Tests (LiteSVM or `anchor test` with local validator), each must be able to fail:
- happy path: create, answer, tally increments, answerer balance up by reward.
- same SGT answering twice fails.
- attestation signed by a non-attestor key fails.
- attestation for a different answerer fails.
- expired attestation fails.
- missing Ed25519 instruction fails.
- answer after max_answers fails; close_poll refunds remainder.

## API `api/` (attestor)

`POST /api/attest` body `{ wallet: base58, message: string, signature: base58 }`.

1. `message` must equal `headcount sign-in\nwallet: <wallet>\nissued: <unix seconds>` with issued within 300s of now. Verify ed25519 signature with `tweetnacl` or `@solana/kit` `verifySignature`.
2. Look up SGT on MAINNET (env `MAINNET_RPC_URL`, default `https://api.mainnet-beta.solana.com`): `getTokenAccountsByOwner(wallet, { programId: TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb }, { encoding: "jsonParsed" })`, keep accounts with amount 1, then `getAccountInfo(mint, jsonParsed)` and require the mint's `tokenGroupMember` extension `group == GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te`. Also confirm `mintAuthority`/`metadataPointer` match the group's update authority when present.
3. No SGT: `403 { error: "no_seeker_genesis_token" }`.
4. SGT found: `expires_at = now + 600`; sign `b"headcount:v1" || wallet || sgt_mint || expires_at LE` with the attestor keypair from env `ATTESTOR_SECRET_KEY` (base58 64-byte). Return `{ sgtMint, expiresAt, attestorPubkey, signature }` (base58).

`GET /api/health` returns attestor pubkey and cluster.

Test: a script that runs the SGT lookup against a real mainnet SGT holder (find one by `getProgramAccounts`/`getTokenLargestAccounts` on a mint that is a member of the group, or from Solscan) and against a wallet with no SGT, printing both results. Both must be real mainnet reads.

## App screens (Expo Router)

- `Today` (home): open polls, each card shows question, reward, answers left, closes in. Tap card -> poll screen.
- Poll screen: options as large tap targets, "Answer and earn N SKR" button -> MWA sign-in message (once per session) -> `/api/attest` -> build tx `[ed25519 ix, answer ix]` -> MWA signAndSend -> confirmation with haptic + live tally bar reveal (results hidden until you answer).
- `Create`: question, 2..6 options, reward per answer, max answers, duration -> create_poll.
- `Me`: streak (consecutive days answered), total earned, answered polls.
- Non-Seeker wallet: attest returns 403 -> screen explains Headcount counts phones, shows the wallet's tally view read-only.
