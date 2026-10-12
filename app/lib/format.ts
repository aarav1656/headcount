export function formatTokens(amount: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals)
  const whole = amount / base
  const frac = (amount % base).toString().padStart(decimals, '0').replace(/0+$/, '')
  const w = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return frac ? `${w}.${frac}` : w
}

/** Parses a user-typed decimal string into base units. Returns null when it is not a valid positive amount. */
export function parseTokens(text: string, decimals: number): bigint | null {
  const m = /^(\d{1,15})(?:\.(\d{1,18}))?$/.exec(text.trim())
  if (!m) return null
  const frac = m[2] ?? ''
  if (frac.length > decimals) return null
  const v = BigInt(m[1]) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, '0') || '0')
  return v > 0n ? v : null
}

export function timeLeft(closesAt: bigint, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const s = Number(closesAt) - nowSeconds
  if (s <= 0) return 'ended'
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

export function utf8Length(s: string): number {
  return new TextEncoder().encode(s).length
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`

/** Days (local time) on which at least one answer was given, as a set of keys. */
export function answerDays(timestampsSeconds: bigint[]): Set<string> {
  return new Set(timestampsSeconds.map((t) => dayKey(new Date(Number(t) * 1000))))
}

/** Consecutive answered days ending today, or ending yesterday if nothing is answered yet today. */
export function currentStreak(days: Set<string>, now = new Date()): number {
  const d = new Date(now)
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1)
  let n = 0
  while (days.has(dayKey(d))) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}

export function lastSevenDays(
  days: Set<string>,
  now = new Date(),
): { label: string; answered: boolean; today: boolean }[] {
  const out: { label: string; answered: boolean; today: boolean }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    out.push({ label: 'SMTWTFS'[d.getDay()], answered: days.has(dayKey(d)), today: i === 0 })
  }
  return out
}
