import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { ed25519 } from '@noble/curves/ed25519.js'
import {
  address,
  generateKeyPairSigner,
  getBase58Decoder,
  getAddressEncoder,
  getProgramDerivedAddress,
  getU64Encoder,
  type Address,
} from '@solana/kit'
import { PROGRAM_ID } from '@/constants/headcount'
import {
  ACCOUNT,
  answerAddress,
  answerInstruction,
  ataAddress,
  attestationMessage,
  configAddress,
  decodeAnswer,
  decodePoll,
  ed25519Instruction,
  ATA_PROGRAM,
  IX,
  pollAddress,
  TOKEN_PROGRAM,
  vaultAddress,
} from './program'
import { findProgramAddress } from './pda'

const idl = JSON.parse(readFileSync(resolve(process.cwd(), '../program/idl/headcount.json'), 'utf8'))
const sha8 = (s: string) => Array.from(createHash('sha256').update(s).digest().subarray(0, 8))

test('instruction discriminators equal the IDL and sha256("global:<name>")', () => {
  const byName: Record<string, Uint8Array> = {
    create_poll: IX.createPoll,
    answer: IX.answer,
    close_poll: IX.closePoll,
    init_config: IX.initConfig,
  }
  assert.equal(Object.keys(byName).length, 4)
  for (const [name, mine] of Object.entries(byName)) {
    const fromIdl = idl.instructions.find((i: { name: string }) => i.name === name)
    assert.ok(fromIdl, `${name} in IDL`)
    assert.deepEqual(Array.from(mine), fromIdl.discriminator, `${name} vs IDL`)
    assert.deepEqual(Array.from(mine), sha8(`global:${name}`), `${name} vs sha256`)
  }
})

test('account discriminators equal the IDL and sha256("account:<Name>")', () => {
  const byName: Record<string, Uint8Array> = { Poll: ACCOUNT.poll, Answer: ACCOUNT.answer, Config: ACCOUNT.config }
  for (const [name, mine] of Object.entries(byName)) {
    const fromIdl = idl.accounts.find((a: { name: string }) => a.name === name)
    assert.deepEqual(Array.from(mine), fromIdl.discriminator, `${name} vs IDL`)
    assert.deepEqual(Array.from(mine), sha8(`account:${name}`), `${name} vs sha256`)
  }
})

test('pure-JS PDA derivation matches kit across 60 random seed sets', async () => {
  let offCurveBumpSeen = 0
  for (let i = 0; i < 60; i++) {
    const owner = (await generateKeyPairSigner()).address
    const mint = (await generateKeyPairSigner()).address
    const id = BigInt(Date.now()) + BigInt(i)
    const idSeed = getU64Encoder().encode(id) as Uint8Array
    const enc = getAddressEncoder()
    const seedSets: [Address, Uint8Array[]][] = [
      [PROGRAM_ID, [new TextEncoder().encode('poll'), enc.encode(owner) as Uint8Array, idSeed]],
      [PROGRAM_ID, [new TextEncoder().encode('vault'), enc.encode(mint) as Uint8Array]],
      [
        ATA_PROGRAM,
        [enc.encode(owner) as Uint8Array, enc.encode(TOKEN_PROGRAM) as Uint8Array, enc.encode(mint) as Uint8Array],
      ],
    ]
    for (const [program, seeds] of seedSets) {
      const [mine, bump] = findProgramAddress(program, seeds)
      const [theirs, theirBump] = await getProgramDerivedAddress({ programAddress: program, seeds })
      assert.equal(mine, theirs)
      assert.equal(bump, theirBump)
      if (bump !== 255) offCurveBumpSeen++
    }
  }
  assert.ok(
    offCurveBumpSeen > 0,
    'at least one derivation had to skip an on-curve bump, so the curve check is exercised',
  )
})

test('typed address helpers match kit', async () => {
  const [cfg] = await getProgramDerivedAddress({
    programAddress: PROGRAM_ID,
    seeds: [new TextEncoder().encode('config')],
  })
  assert.equal(configAddress(), cfg)
  const creator = (await generateKeyPairSigner()).address
  const sgt = (await generateKeyPairSigner()).address
  const poll = pollAddress(creator, 7n)
  const [pollK] = await getProgramDerivedAddress({
    programAddress: PROGRAM_ID,
    seeds: [new TextEncoder().encode('poll'), getAddressEncoder().encode(creator), getU64Encoder().encode(7n)],
  })
  assert.equal(poll, pollK)
  assert.notEqual(vaultAddress(poll), poll)
  assert.notEqual(answerAddress(poll, sgt), answerAddress(poll, creator))
})

test('attestation message is 84 bytes with the exact on-chain layout', async () => {
  const w = (await generateKeyPairSigner()).address
  const s = (await generateKeyPairSigner()).address
  const m = attestationMessage(w, s, 1_900_000_000n)
  assert.equal(m.length, 84)
  assert.equal(new TextDecoder().decode(m.subarray(0, 12)), 'headcount:v1')
  assert.deepEqual(Array.from(m.subarray(12, 44)), Array.from(getAddressEncoder().encode(w)))
  assert.deepEqual(Array.from(m.subarray(44, 76)), Array.from(getAddressEncoder().encode(s)))
  assert.equal(new DataView(m.buffer, m.byteOffset).getBigInt64(76, true), 1_900_000_000n)
})

test('ed25519 instruction offsets parse the way the on-chain program reads them, and the signature verifies', () => {
  const sk = ed25519.utils.randomSecretKey()
  const pk = ed25519.getPublicKey(sk)
  const msg = new Uint8Array(84).map((_, i) => i)
  const sig = ed25519.sign(msg, sk)
  const pkAddr = address(getBase58Decoder().decode(pk))
  const ix = ed25519Instruction({ signature: sig, publicKey: pkAddr, message: msg })
  const d = ix.data as Uint8Array
  const rd = (i: number) => d[i] | (d[i + 1] << 8)
  assert.equal(d[0], 1)
  assert.equal(rd(4), 0xffff)
  assert.equal(rd(8), 0xffff)
  assert.equal(rd(14), 0xffff)
  const sigOff = rd(2)
  const pkOff = rd(6)
  const msgOff = rd(10)
  const msgLen = rd(12)
  assert.equal(msgLen, 84)
  assert.deepEqual(Array.from(d.subarray(pkOff, pkOff + 32)), Array.from(pk))
  assert.deepEqual(Array.from(d.subarray(msgOff, msgOff + msgLen)), Array.from(msg))
  assert.ok(
    ed25519.verify(d.subarray(sigOff, sigOff + 64), d.subarray(msgOff, msgOff + msgLen), d.subarray(pkOff, pkOff + 32)),
  )
  assert.equal(d.length, msgOff + msgLen)
  assert.equal(ix.programAddress, 'Ed25519SigVerify111111111111111111111111111')
})

test('answer instruction account order and data match the IDL', async () => {
  const answerer = (await generateKeyPairSigner()).address
  const sgt = (await generateKeyPairSigner()).address
  const mint = (await generateKeyPairSigner()).address
  const creator = (await generateKeyPairSigner()).address
  const poll = pollAddress(creator, 1n)
  const ix = answerInstruction({
    answerer,
    poll: {
      address: poll,
      creator,
      pollId: 1n,
      rewardMint: mint,
      rewardPerAnswer: 5n,
      maxAnswers: 2,
      answers: 0,
      closesAt: 0n,
      question: 'q',
      options: ['a', 'b'],
      tallies: [0, 0],
      closed: false,
    },
    choice: 1,
    sgtMint: sgt,
    expiresAt: 1234n,
    tokenProgram: TOKEN_PROGRAM,
  })
  const idlAccounts: string[] = idl.instructions
    .find((i: { name: string }) => i.name === 'answer')
    .accounts.map((a: { name: string }) => a.name)
  assert.equal(ix.accounts!.length, idlAccounts.length)
  assert.equal(ix.accounts![0].address, answerer)
  assert.equal(ix.accounts![2].address, poll)
  assert.equal(ix.accounts![3].address, answerAddress(poll, sgt))
  assert.equal(ix.accounts![6].address, ataAddress(answerer, mint, TOKEN_PROGRAM))
  const d = ix.data as Uint8Array
  assert.equal(d.length, 8 + 1 + 32 + 8)
  assert.equal(d[8], 1)
  assert.equal(new DataView(d.buffer, d.byteOffset).getBigInt64(8 + 1 + 32, true), 1234n)
})

test('decodePoll and decodeAnswer reject foreign accounts', () => {
  const junk = new Uint8Array(200)
  assert.throws(() => decodePoll(PROGRAM_ID, junk), /not a Poll/)
  assert.throws(() => decodeAnswer(PROGRAM_ID, junk), /not a Answer/)
})
