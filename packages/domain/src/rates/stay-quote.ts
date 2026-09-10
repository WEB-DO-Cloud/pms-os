import { stayNightDates } from '../commands/create-direct-reservation'
import {
  ARI_FRESHNESS_MS,
  publicVacancyForNight,
} from '../public-booking/vacancy'
import type { DomainStore, RatePlanRecord } from '../store'

export const PUBLIC_QUOTE_HORIZON_DAYS = 90
export { ARI_FRESHNESS_MS }

export type StayQuoteFailureReason =
  | 'past_checkin'
  | 'horizon'
  | 'invalid_dates'
  | 'missing_ari'
  | 'stale_ari'
  | 'sold_out'
  | 'stop_sell'
  | 'min_stay'
  | 'closed_to_arrival'
  | 'closed_to_departure'
  | 'occupancy'
  | 'derived_plan'
  | 'no_rate'

export type StayQuoteNight = {
  date: string
  rateMinor: number
}

export type StayQuoteOk = {
  ok: true
  nights: StayQuoteNight[]
  stayTotalMinor: number
  currency: string
  baseSnapshotVersion: number
  remaining: number
}

export type StayQuoteErr = {
  ok: false
  reason: StayQuoteFailureReason
}

export function isParentOrManualRatePlan(plan: RatePlanRecord): boolean {
  return plan.parentRatePlanChannexId == null
}

export function calendarDateInZone(timeZone: string, nowMs = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(nowMs)
}

export function addUtcDays(isoDate: string, days: number): string {
  const cursor = new Date(`${isoDate}T00:00:00Z`)
  cursor.setUTCDate(cursor.getUTCDate() + days)
  return cursor.toISOString().slice(0, 10)
}

export function quoteStay(
  store: Pick<
    DomainStore,
    'ariAvailability' | 'ariRestrictions' | 'reservations' | 'ratePlans'
  >,
  input: {
    networkId: number
    propertyId: number
    roomTypeId: number
    ratePlanChannexId: string
    checkInDate: string
    checkOutDate: string
    adults: number
    occupancyCap: number
    timeZone: string
    nowMs?: number
    freshnessMs?: number
  },
): StayQuoteOk | StayQuoteErr {
  const nowMs = input.nowMs ?? Date.now()
  const freshnessMs = input.freshnessMs ?? ARI_FRESHNESS_MS
  const nights = stayNightDates(input.checkInDate, input.checkOutDate)
  if (nights.length === 0) return { ok: false, reason: 'invalid_dates' }
  if (input.adults < 1 || input.adults > input.occupancyCap) {
    return { ok: false, reason: 'occupancy' }
  }

  const today = calendarDateInZone(input.timeZone, nowMs)
  if (input.checkInDate < today) return { ok: false, reason: 'past_checkin' }
  if (input.checkInDate > addUtcDays(today, PUBLIC_QUOTE_HORIZON_DAYS)) {
    return { ok: false, reason: 'horizon' }
  }

  const plan = store.ratePlans.find(
    (p) =>
      p.networkId === input.networkId &&
      p.propertyId === input.propertyId &&
      p.channexId === input.ratePlanChannexId,
  )
  if (!plan || !isParentOrManualRatePlan(plan)) {
    return { ok: false, reason: 'derived_plan' }
  }

  const arrival = nights[0]!
  const checkout = input.checkOutDate
  let stayTotalMinor = 0
  let snapshotVersion = 0
  let minRemaining = Number.POSITIVE_INFINITY
  const priced: StayQuoteNight[] = []
  const currency = plan.currency ?? 'USD'

  for (const night of nights) {
    const vacancy = publicVacancyForNight(store, {
      networkId: input.networkId,
      propertyId: input.propertyId,
      roomTypeId: input.roomTypeId,
      night,
      nowMs,
      freshnessMs,
    })
    if (!vacancy.ok) return { ok: false, reason: vacancy.reason }
    if (vacancy.remaining < 1) return { ok: false, reason: 'sold_out' }
    minRemaining = Math.min(minRemaining, vacancy.remaining)

    const restriction = store.ariRestrictions.find(
      (r) =>
        r.networkId === input.networkId &&
        r.propertyId === input.propertyId &&
        r.ratePlanChannexId === input.ratePlanChannexId &&
        r.date === night,
    )
    if (!restriction || restriction.rateMinor == null) {
      return { ok: false, reason: 'no_rate' }
    }
    if (restriction.stopSell) return { ok: false, reason: 'stop_sell' }
    if (night === arrival && restriction.closedToArrival) {
      return { ok: false, reason: 'closed_to_arrival' }
    }
    if (restriction.minStayArrival != null && nights.length < restriction.minStayArrival) {
      return { ok: false, reason: 'min_stay' }
    }
    if (restriction.minStayThrough != null && nights.length < restriction.minStayThrough) {
      return { ok: false, reason: 'min_stay' }
    }
    snapshotVersion = Math.max(snapshotVersion, restriction.snapshotVersion)
    stayTotalMinor += restriction.rateMinor
    priced.push({ date: night, rateMinor: restriction.rateMinor })
  }

  const departureRestriction = store.ariRestrictions.find(
    (r) =>
      r.networkId === input.networkId &&
      r.propertyId === input.propertyId &&
      r.ratePlanChannexId === input.ratePlanChannexId &&
      r.date === checkout,
  )
  if (departureRestriction?.closedToDeparture) {
    return { ok: false, reason: 'closed_to_departure' }
  }

  return {
    ok: true,
    nights: priced,
    stayTotalMinor,
    currency,
    baseSnapshotVersion: snapshotVersion,
    remaining: minRemaining,
  }
}
