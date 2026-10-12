# Headcount

Polls where every answer comes from a different phone.

A project funds a poll in SKR. Seeker owners answer it once per device and get paid in the same transaction. The creator gets results that a bot farm can't move, because the program keys each answer to the phone's Seeker Genesis Token rather than to a wallet. Spinning up a thousand wallets buys you nothing when the thousand-and-first answer from the same phone fails on-chain.

Built for CLOCK IN, the Solana Mobile hackathon.

## Why it matters

Every token team wants to know what its users think, and every open survey on Solana gets farmed. Solana Mobile itself changed the Seed Vault daily score to reward "natural Seed Vault Wallet use over activity manufactured to game the score" ([post](https://x.com/solanamobile/status/2090472369840382175)). Headcount makes the honest answer the only one that pays: one phone, one ballot.

The results screen shows two bars for every option. One counts Seeker phones; the other counts every wallet that answered an open poll. When they disagree by more than ten points, Headcount labels the difference as the bot gap. That gap is the product.

## How it works

1. **Sign in.** The app asks the wallet (through Mobile Wallet Adapter) to sign a short sign-in message.
2. **Attest.** The attestor at `https://headcount-attest.fly.dev` verifies the signature, then reads Solana mainnet for a Seeker Genesis Token in that wallet: a Token-2022 mint whose `tokenGroupMember` extension points at the SGT group `GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te`. It returns an Ed25519 attestation over `headcount:v2 || answerer || identity || tier || expires_at`. Identity is the SGT mint for a Seeker and the wallet for everyone else.
3. **Answer.** The app sends one transaction: the Ed25519 verify instruction followed by `answer`. The program reads the instructions sysvar, checks the attestor key, the exact message bytes and the expiry, then creates the `Answer` account at `["answer", poll, identity]`. A second answer from the same phone collides with that address and fails.
4. **Get paid.** The same instruction moves `reward_per_answer` from the poll vault to the answerer's token account.

Creators choose **Seeker phones only** (bot-proof) or **Open** (any wallet, with Seeker answers tallied separately).

## On-chain

| | |
|---|---|
| Program (devnet) | `12kijt3UyT3TGnGbQn9Z4M9qe9uuHyc7ypWhLE57dkF3` |
| Attestor key | `9zSRzo8Fm1NQ8xAk2EV4Jeqtk5eaUBwvy4YbJmpQBfAX` |
| Reward mint (devnet SKR) | `3BySLyP6nGFKDfFdfcsuT4ZmcndDsnsiLsHMCToT5i5V` |
| Mainnet SKR (cluster config) | `SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3` |

Instructions: `init_config`, `set_attestor`, `create_poll`, `answer`, `close_poll`. All arithmetic is checked. The Ed25519 offsets must point inside the verify instruction itself (every instruction index is `u16::MAX`), so a transaction can't smuggle in a signature from somewhere else.

## Proof it runs

The end-to-end script `scripts/e2e-answer.ts` runs against devnet and the live attestor. A fresh wallet with no SGT answered an open poll: the tally went from 2 to 3, the wallet received exactly 5 SKR, and the Seeker tally didn't move. The same wallet then tried the Seekers-only poll, and the program rejected it with `SeekersOnly` (6019).

Tests:

- `program/`: 15 LiteSVM tests covering the happy path, double answers from one SGT, a foreign attestor, an attestation for a different answerer or SGT, expiry, a missing or misdirected Ed25519 instruction, the answer cap and refund, and tier rules. Removing the attestor check or the Seekers-only check turns the matching tests red.
- `api/`: signed-message byte layout and tamper rejection.
- `app/`: instruction builders, Ed25519 layout and PDA derivation.

## Run it

```bash
# program
cd program && cargo test

# attestor (needs ATTESTOR_SECRET_KEY, see api/.env.example)
cd api && npm install && npx tsx server.ts

# app
cd app && npm install && npx expo prebuild -p android && cd android && ./gradlew assembleRelease
```

The Android release APK is built by `.github/workflows/android.yml` on every push to `main`.

## Layout

```
program/   Anchor 0.32 program and LiteSVM tests
api/       attestor: mainnet SGT lookup and Ed25519 signing (Fly)
app/       Expo SDK 55 Android app, @solana/kit, Mobile Wallet Adapter
scripts/   devnet setup, seeding and end-to-end checks
```
