import type { AriAvailabilityRecord, DomainStore, ReservationRecord } from '../store'
import { stayNightDates } from '../commands/create-direct-reservation'

export const ARI_FRESHNESS_MS = 60 * 60 * 1000

export const OCCUPYING_RESERVATION_STATUSES = new Set([
  'pending_payment',
  'pending_sync',
  'pending',
  'confirmed',
  'checked_in',
  'new',
  'modified',
])

export const RELEASED_RESERVATION_STATUSES = new Set([
  'cancelled',
  'released',
  'refunded',
  'no_show',
  'expired',
])

export function reservationOccupiesInventory(status: string): boolean {
  if (RELEASED_RESERVATION_STATUSES.has(status)) return false
  return OCCUPYING_RESERVATION_STATUSES.has(status)
}

export function localOccupiedCount(
  reservations: readonly ReservationRecord[],
  input: {
    networkId: number
    propertyId: number
    roomTypeId: number
    night: string
    excludeReservationId?: number
  },
): number {
  return reservations.filter((row) => {
    if (row.networkId !== input.networkId) return false
    if (row.propertyId !== input.propertyId) return false
    if (row.roomTypeId !== input.roomTypeId) return false
    if (input.excludeReservationId != null && row.id === input.excludeReservationId) {
      return false
    }
    if (!reservationOccupiesInventory(row.status)) return false
    const nights = stayNightDates(row.checkInDate, row.checkOutDate)
    return nights.includes(input.night)
  }).length
}

export function freshAriAvailability(
  rows: readonly AriAvailabilityRecord[],
  input: {
    networkId: number
    propertyId: number
    roomTypeId: number
    night: string
    nowMs: number
    freshnessMs: number
  },
): { kind: 'fresh'; availability: number } | { kind: 'missing' } | { kind: 'stale' } {
  const matches = rows.filter(
    (a) =>
      a.networkId === input.networkId &&
      a.propertyId === input.propertyId &&
      a.roomTypeId === input.roomTypeId &&
      a.date === input.night,
  )
  if (matches.length === 0) return { kind: 'missing' }
  if (matches.some((a) => input.nowMs - Date.parse(a.pulledAt) > input.freshnessMs)) {
    return { kind: 'stale' }
  }
  return {
    kind: 'fresh',
    availability: matches.reduce((sum, row) => sum + row.availability, 0),
  }
}

/** Public vacancy: min(fresh ARI, remaining after local occupying stays). */
export function publicVacancyForNight(
  store: Pick<DomainStore, 'ariAvailability' | 'reservations'>,
  input: {
    networkId: number
    propertyId: number
    roomTypeId: number
    night: string
    nowMs: number
    freshnessMs: number
    excludeReservationId?: number
  },
):
  | { ok: true; remaining: number }
  | { ok: false; reason: 'missing_ari' | 'stale_ari' } {
  const ari = freshAriAvailability(store.ariAvailability, input)
  if (ari.kind !== 'fresh') {
    return { ok: false, reason: ari.kind === 'stale' ? 'stale_ari' : 'missing_ari' }
  }
  const local = localOccupiedCount(store.reservations, input)
  return { ok: true, remaining: Math.max(0, ari.availability - local) }
}
