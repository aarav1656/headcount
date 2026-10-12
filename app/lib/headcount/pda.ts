import { ed25519 } from '@noble/curves/ed25519.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { address, getAddressDecoder, getAddressEncoder, type Address } from '@solana/kit'

// Pure-JS PDA derivation. React Native's crypto.subtle is a partial polyfill, so the app
// never depends on it for address derivation. pda.test.ts checks this against kit.

const PDA_MARKER = new TextEncoder().encode('ProgramDerivedAddress')
const encodeAddress = getAddressEncoder()
const decodeAddress = getAddressDecoder()

function isOnCurve(bytes: Uint8Array): boolean {
  try {
    ed25519.Point.fromBytes(bytes)
    return true
  } catch {
    return false
  }
}

export function findProgramAddress(programId: Address, seeds: Uint8Array[]): readonly [Address, number] {
  const program = encodeAddress.encode(programId)
  for (let bump = 255; bump >= 0; bump--) {
    const parts = [...seeds, Uint8Array.of(bump), program, PDA_MARKER]
    const buf = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
    let o = 0
    for (const p of parts) {
      buf.set(p, o)
      o += p.length
    }
    const hash = sha256(buf)
    if (!isOnCurve(hash)) return [address(decodeAddress.decode(hash)), bump]
  }
  throw new Error('no viable program address bump')
}
