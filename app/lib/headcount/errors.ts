// Program error codes from program/idl/headcount.json, 6000 and up.
const PROGRAM_ERRORS: Record<number, string> = {
  6000: 'The question must be 1 to 160 bytes.',
  6001: 'A poll needs 2 to 6 options.',
  6002: 'Each option must be 1 to 40 bytes.',
  6003: 'A poll needs room for at least one answer.',
  6004: 'The reward must be at least one base unit.',
  6005: 'The poll must close in the future.',
  6006: 'That amount is too large.',
  6007: 'This poll is closed.',
  6008: 'This poll has ended.',
  6009: 'This poll has all the answers it asked for.',
  6010: 'That option does not exist.',
  6011: 'Your Seeker check expired. Try again.',
  6012: 'The Seeker check was missing from the transaction.',
  6013: 'The Seeker check was malformed.',
  6014: 'The Seeker check was not signed by the Headcount attestor.',
  6015: 'The Seeker check does not match this wallet and phone.',
  6016: 'Only the admin can do this.',
  6017: 'Only the poll creator can do this.',
  6018: 'This poll cannot be closed yet.',
}

export const ALREADY_ANSWERED_MESSAGE = 'This phone already answered this poll.'

const SYSTEM_ERRORS: Record<number, string> = {
  0: ALREADY_ANSWERED_MESSAGE,
}

export class HeadcountUserError extends Error {}

function findCustomCode(value: unknown): number | null {
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>
    if ('Custom' in v) return Number(v.Custom)
    for (const k of Object.keys(v)) {
      const found = findCustomCode(v[k])
      if (found !== null) return found
    }
  }
  return null
}

/** Turns a simulation `err` object (InstructionError / Custom) into one sentence for the user. */
export function describeSimulationError(err: unknown, answerIndex: number): string {
  if (typeof err === 'string') {
    if (err === 'AccountNotFound')
      return 'Your wallet needs a little SOL on this network to pay for the accounts this creates.'
    if (err === 'InsufficientFundsForRent')
      return 'Your wallet needs a little more SOL to pay for the accounts this creates.'
    return `The network rejected this transaction (${err}).`
  }
  const code = findCustomCode(err)
  if (code !== null) {
    const ie = (err as { InstructionError?: [number | string, unknown] }).InstructionError
    const ixIndex = ie ? Number(ie[0]) : -1
    if (code >= 6000 && PROGRAM_ERRORS[code]) return PROGRAM_ERRORS[code]
    if (ixIndex === answerIndex && SYSTEM_ERRORS[code]) return SYSTEM_ERRORS[code]
    return `The network rejected this transaction (error ${code}).`
  }
  if (err && typeof err === 'object' && 'InsufficientFundsForRent' in err) {
    return 'Your wallet needs a little more SOL to pay for the accounts this creates.'
  }
  return 'The network rejected this transaction.'
}

/** Normalises wallet and RPC failures. Cancelling in the wallet is not an error worth shouting about. */
export function describeError(e: unknown): { message: string; cancelled: boolean } {
  const text = e instanceof Error ? e.message : String(e)
  if (/declined|reject|cancel|CancellationException|ERROR_AUTHORIZATION_FAILED/i.test(text)) {
    return { message: 'Cancelled in your wallet.', cancelled: true }
  }
  if (/found no installed wallet|no wallet|ERROR_WALLET_NOT_FOUND/i.test(text)) {
    return {
      message: 'No Solana wallet app was found on this phone. Install one that supports Mobile Wallet Adapter.',
      cancelled: false,
    }
  }
  if (e instanceof HeadcountUserError) return { message: e.message, cancelled: false }
  if (/Network request failed|fetch failed|timeout/i.test(text)) {
    return { message: 'Could not reach the network. Check your connection and try again.', cancelled: false }
  }
  return { message: text, cancelled: false }
}
