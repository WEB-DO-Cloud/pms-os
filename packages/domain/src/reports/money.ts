/** Integer minor units + ISO currency — never floats for money math (KTD24). */
export function formatMoneyMinor(amountMinor: number, currency: string): string {
  const sign = amountMinor < 0 ? '-' : ''
  const abs = Math.abs(amountMinor)
  const whole = Math.floor(abs / 100)
  const frac = String(abs % 100).padStart(2, '0')
  return `${sign}${whole}.${frac} ${currency}`
}

/** Property-local stay nights between YYYY-MM-DD check-in (inclusive) and check-out (exclusive). */
export function stayNights(checkInDate: string, checkOutDate: string): number {
  const a = parseLocalDate(checkInDate)
  const b = parseLocalDate(checkOutDate)
  const ms = b.getTime() - a.getTime()
  if (!Number.isFinite(ms) || ms <= 0) return 0
  return Math.round(ms / 86_400_000)
}

/** Nights of a stay that overlap [rangeFrom, rangeTo] (both inclusive calendar days for occupied nights). */
export function overlappingStayNights(
  checkInDate: string,
  checkOutDate: string,
  rangeFrom: string,
  rangeTo: string,
): number {
  const stayStart = parseLocalDate(checkInDate)
  const stayEndExclusive = parseLocalDate(checkOutDate)
  const from = parseLocalDate(rangeFrom)
  const toInclusive = parseLocalDate(rangeTo)
  const toExclusive = new Date(toInclusive.getTime() + 86_400_000)

  const start = stayStart > from ? stayStart : from
  const end = stayEndExclusive < toExclusive ? stayEndExclusive : toExclusive
  const ms = end.getTime() - start.getTime()
  if (!Number.isFinite(ms) || ms <= 0) return 0
  return Math.round(ms / 86_400_000)
}

export function parseLocalDate(isoDate: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim())
  if (!m) return new Date(NaN)
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
}

export function daysInclusive(rangeFrom: string, rangeTo: string): number {
  const a = parseLocalDate(rangeFrom)
  const b = parseLocalDate(rangeTo)
  const ms = b.getTime() - a.getTime()
  if (!Number.isFinite(ms) || ms < 0) return 0
  return Math.round(ms / 86_400_000) + 1
}
