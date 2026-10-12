import { formatTokens } from '@/lib/format'

/** Short unit printed beside amounts. The cluster is named on the wallet line, not in every figure. */
export const UNIT = 'SKR'

/** Amounts print with two decimals at least, as on a receipt: 5 becomes 5.00, 0.5 becomes 0.50. */
export function money(amount: bigint, decimals: number): string {
  const s = formatTokens(amount, decimals)
  const dot = s.indexOf('.')
  if (dot === -1) return `${s}.00`
  return dot === s.length - 2 ? `${s}0` : s
}
