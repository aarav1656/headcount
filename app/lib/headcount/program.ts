import {
  AccountRole,
  address,
  addDecoderSizePrefix,
  addEncoderSizePrefix,
  fixDecoderSize,
  getAddressDecoder,
  getAddressEncoder,
  getArrayDecoder,
  getArrayEncoder,
  getBooleanDecoder,
  getBase58Decoder,
  getBytesDecoder,
  getI64Decoder,
  getI64Encoder,
  getStructDecoder,
  getStructEncoder,
  getU32Decoder,
  getU32Encoder,
  getU64Decoder,
  getU64Encoder,
  getU8Decoder,
  getU8Encoder,
  getUtf8Decoder,
  getUtf8Encoder,
  type Address,
  type Instruction,
} from '@solana/kit'
import { PROGRAM_ID } from '@/constants/headcount'
import { findProgramAddress } from './pda'

export const TOKEN_PROGRAM = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
export const TOKEN_2022_PROGRAM = address('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')
export const ATA_PROGRAM = address('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')
export const SYSTEM_PROGRAM = address('11111111111111111111111111111111')
export const ED25519_PROGRAM = address('Ed25519SigVerify111111111111111111111111111')

export const MAX_QUESTION_BYTES = 160
export const MAX_OPTION_BYTES = 40
export const MIN_OPTIONS = 2
export const MAX_OPTIONS = 6

// Anchor discriminators, copied from program/idl/headcount.json. discriminators.test.ts
// recomputes them as sha256("global:<ix>") / sha256("account:<Name>") and compares to the IDL.
export const IX = {
  createPoll: Uint8Array.of(182, 171, 112, 238, 6, 219, 14, 110),
  answer: Uint8Array.of(72, 214, 44, 32, 53, 222, 9, 244),
  closePoll: Uint8Array.of(139, 213, 162, 65, 172, 150, 123, 67),
  initConfig: Uint8Array.of(23, 235, 115, 232, 168, 96, 1, 231),
} as const

export const ACCOUNT = {
  poll: Uint8Array.of(110, 234, 167, 188, 231, 136, 153, 111),
  answer: Uint8Array.of(119, 227, 103, 4, 0, 164, 56, 37),
  config: Uint8Array.of(155, 12, 170, 224, 30, 250, 204, 130),
} as const

export const discriminatorBase58 = (d: Uint8Array): string => getBase58Decoder().decode(d)

const utf8 = new TextEncoder()
const addr = getAddressEncoder()
const u64Seed = (n: bigint): Uint8Array => getU64Encoder().encode(n) as Uint8Array

// ---- accounts ----

export type Poll = {
  address: Address
  creator: Address
  pollId: bigint
  rewardMint: Address
  rewardPerAnswer: bigint
  maxAnswers: number
  answers: number
  closesAt: bigint
  question: string
  options: string[]
  tallies: number[]
  closed: boolean
}

export type Answer = {
  address: Address
  poll: Address
  answerer: Address
  sgtMint: Address
  choice: number
  answeredAt: bigint
}

const str = () => addDecoderSizePrefix(getUtf8Decoder(), getU32Decoder())

const pollDecoder = getStructDecoder([
  ['discriminator', fixDecoderSize(getBytesDecoder(), 8)],
  ['creator', getAddressDecoder()],
  ['pollId', getU64Decoder()],
  ['rewardMint', getAddressDecoder()],
  ['rewardPerAnswer', getU64Decoder()],
  ['maxAnswers', getU32Decoder()],
  ['answers', getU32Decoder()],
  ['closesAt', getI64Decoder()],
  ['question', str()],
  ['options', getArrayDecoder(str(), { size: getU32Decoder() })],
  ['tallies', getArrayDecoder(getU32Decoder(), { size: MAX_OPTIONS })],
  ['closed', getBooleanDecoder()],
  ['bump', getU8Decoder()],
  ['vaultBump', getU8Decoder()],
])

const answerDecoder = getStructDecoder([
  ['discriminator', fixDecoderSize(getBytesDecoder(), 8)],
  ['poll', getAddressDecoder()],
  ['answerer', getAddressDecoder()],
  ['sgtMint', getAddressDecoder()],
  ['choice', getU8Decoder()],
  ['answeredAt', getI64Decoder()],
  ['bump', getU8Decoder()],
])

function assertDiscriminator(data: Uint8Array, expected: Uint8Array, name: string) {
  for (let i = 0; i < 8; i++) {
    if (data[i] !== expected[i]) throw new Error(`not a ${name} account`)
  }
}

export function decodePoll(addressOf: Address, data: Uint8Array): Poll {
  assertDiscriminator(data, ACCOUNT.poll, 'Poll')
  const p = pollDecoder.decode(data)
  return {
    address: addressOf,
    creator: p.creator,
    pollId: p.pollId,
    rewardMint: p.rewardMint,
    rewardPerAnswer: p.rewardPerAnswer,
    maxAnswers: p.maxAnswers,
    answers: p.answers,
    closesAt: p.closesAt,
    question: p.question,
    options: p.options,
    tallies: p.tallies.slice(0, p.options.length),
    closed: p.closed,
  }
}

export function decodeAnswer(addressOf: Address, data: Uint8Array): Answer {
  assertDiscriminator(data, ACCOUNT.answer, 'Answer')
  const a = answerDecoder.decode(data)
  return {
    address: addressOf,
    poll: a.poll,
    answerer: a.answerer,
    sgtMint: a.sgtMint,
    choice: a.choice,
    answeredAt: a.answeredAt,
  }
}

// Byte offsets inside the account data, used for getProgramAccounts memcmp filters.
export const POLL_CREATOR_OFFSET = 8n
export const ANSWER_POLL_OFFSET = 8n
export const ANSWER_ANSWERER_OFFSET = 40n

// ---- addresses ----

export function pollAddress(creator: Address, pollId: bigint): Address {
  return findProgramAddress(PROGRAM_ID, [utf8.encode('poll'), addr.encode(creator) as Uint8Array, u64Seed(pollId)])[0]
}

export function vaultAddress(poll: Address): Address {
  return findProgramAddress(PROGRAM_ID, [utf8.encode('vault'), addr.encode(poll) as Uint8Array])[0]
}

export function answerAddress(poll: Address, sgtMint: Address): Address {
  return findProgramAddress(PROGRAM_ID, [
    utf8.encode('answer'),
    addr.encode(poll) as Uint8Array,
    addr.encode(sgtMint) as Uint8Array,
  ])[0]
}

export function configAddress(): Address {
  return findProgramAddress(PROGRAM_ID, [utf8.encode('config')])[0]
}

export function ataAddress(owner: Address, mint: Address, tokenProgram: Address): Address {
  return findProgramAddress(ATA_PROGRAM, [
    addr.encode(owner) as Uint8Array,
    addr.encode(tokenProgram) as Uint8Array,
    addr.encode(mint) as Uint8Array,
  ])[0]
}

// ---- instructions ----

const ro = (a: Address) => ({ address: a, role: AccountRole.READONLY })
const rw = (a: Address) => ({ address: a, role: AccountRole.WRITABLE })
const signer = (a: Address) => ({ address: a, role: AccountRole.WRITABLE_SIGNER })

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

const stringEnc = () => addEncoderSizePrefix(getUtf8Encoder(), getU32Encoder())

const createPollArgs = getStructEncoder([
  ['pollId', getU64Encoder()],
  ['question', stringEnc()],
  ['options', getArrayEncoder(stringEnc(), { size: getU32Encoder() })],
  ['rewardPerAnswer', getU64Encoder()],
  ['maxAnswers', getU32Encoder()],
  ['closesAt', getI64Encoder()],
])

export type CreatePollParams = {
  creator: Address
  pollId: bigint
  question: string
  options: string[]
  rewardPerAnswer: bigint
  maxAnswers: number
  closesAt: bigint
  rewardMint: Address
  tokenProgram: Address
}

export function createPollInstruction(p: CreatePollParams): Instruction {
  const poll = pollAddress(p.creator, p.pollId)
  const data = concat(
    IX.createPoll,
    createPollArgs.encode({
      pollId: p.pollId,
      question: p.question,
      options: p.options,
      rewardPerAnswer: p.rewardPerAnswer,
      maxAnswers: p.maxAnswers,
      closesAt: p.closesAt,
    }) as Uint8Array,
  )
  return {
    programAddress: PROGRAM_ID,
    accounts: [
      signer(p.creator),
      rw(poll),
      ro(p.rewardMint),
      rw(vaultAddress(poll)),
      rw(ataAddress(p.creator, p.rewardMint, p.tokenProgram)),
      ro(p.tokenProgram),
      ro(SYSTEM_PROGRAM),
    ],
    data,
  }
}

export type AnswerParams = {
  answerer: Address
  poll: Poll
  choice: number
  sgtMint: Address
  expiresAt: bigint
  tokenProgram: Address
}

export function answerInstruction(p: AnswerParams): Instruction {
  const data = concat(
    IX.answer,
    getStructEncoder([
      ['choice', getU8Encoder()],
      ['sgtMint', getAddressEncoder()],
      ['expiresAt', getI64Encoder()],
    ]).encode({ choice: p.choice, sgtMint: p.sgtMint, expiresAt: p.expiresAt }) as Uint8Array,
  )
  return {
    programAddress: PROGRAM_ID,
    accounts: [
      signer(p.answerer),
      ro(configAddress()),
      rw(p.poll.address),
      rw(answerAddress(p.poll.address, p.sgtMint)),
      ro(p.poll.rewardMint),
      rw(vaultAddress(p.poll.address)),
      rw(ataAddress(p.answerer, p.poll.rewardMint, p.tokenProgram)),
      ro(address('Sysvar1nstructions1111111111111111111111111')),
      ro(p.tokenProgram),
      ro(ATA_PROGRAM),
      ro(SYSTEM_PROGRAM),
    ],
    data,
  }
}

export function closePollInstruction(p: { creator: Address; poll: Poll; tokenProgram: Address }): Instruction {
  return {
    programAddress: PROGRAM_ID,
    accounts: [
      signer(p.creator),
      rw(p.poll.address),
      ro(p.poll.rewardMint),
      rw(vaultAddress(p.poll.address)),
      rw(ataAddress(p.creator, p.poll.rewardMint, p.tokenProgram)),
      ro(p.tokenProgram),
    ],
    data: IX.closePoll,
  }
}

export function initConfigInstruction(p: { admin: Address; attestor: Address }): Instruction {
  return {
    programAddress: PROGRAM_ID,
    accounts: [signer(p.admin), rw(configAddress()), ro(SYSTEM_PROGRAM)],
    data: concat(IX.initConfig, addr.encode(p.attestor) as Uint8Array),
  }
}

// ---- attestation + Ed25519 precompile ----

const ATTEST_PREFIX = utf8.encode('headcount:v1')

/** b"headcount:v1" || answerer(32) || sgt_mint(32) || expires_at i64 LE, the bytes the attestor signs. */
export function attestationMessage(answerer: Address, sgtMint: Address, expiresAt: bigint): Uint8Array {
  return concat(
    ATTEST_PREFIX,
    addr.encode(answerer) as Uint8Array,
    addr.encode(sgtMint) as Uint8Array,
    getI64Encoder().encode(expiresAt) as Uint8Array,
  )
}

/**
 * Solana Ed25519 program instruction with one signature. Layout: [count u8, pad u8,
 * offsets (7 x u16 LE), signature(64), pubkey(32), message]. Every *_instruction_index is
 * 0xFFFF so the offsets point inside this same instruction, which `answer` requires.
 */
export function ed25519Instruction(p: { signature: Uint8Array; publicKey: Address; message: Uint8Array }): Instruction {
  if (p.signature.length !== 64) throw new Error('ed25519 signature must be 64 bytes')
  const header = 2 + 14
  const sigOff = header
  const pkOff = sigOff + 64
  const msgOff = pkOff + 32
  const u16 = (n: number) => Uint8Array.of(n & 0xff, (n >> 8) & 0xff)
  const SAME_IX = 0xffff
  const data = concat(
    Uint8Array.of(1, 0),
    u16(sigOff),
    u16(SAME_IX),
    u16(pkOff),
    u16(SAME_IX),
    u16(msgOff),
    u16(p.message.length),
    u16(SAME_IX),
    p.signature,
    addr.encode(p.publicKey) as Uint8Array,
    p.message,
  )
  return { programAddress: ED25519_PROGRAM, accounts: [], data }
}
