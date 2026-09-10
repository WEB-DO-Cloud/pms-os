import { assertCapability, assertFreshSnapshot, enqueueAriIntent } from '../ari'
import { ARI_FRESHNESS_MS, publicVacancyForNight } from '../public-booking/vacancy'
import type { PaymentTermsSnapshot } from '../public-booking/policy'
import type { CommandDefinition, DomainStore, ReservationRecord } from '../store'

export type CreateDirectReservationInput = {
  propertyId: number
  checkInDate: string
  checkOutDate: string
  guestName: string
  guestEmail?: string | null
  adults?: number
  children?: number
  infants?: number
  currency?: string
  /** Local room-type id (projection). */
  roomTypeId: number
  /** Channex room-type UUID for Booking CRS. */
  roomTypeChannexId: string
  /** Channex rate-plan UUID for Booking CRS. */
  ratePlanChannexId: string
  /** Nightly prices: YYYY-MM-DD → decimal string ("100.00"). */
  days: Record<string, string>
  /**
   * Editor snapshot version. When provided, must match reconciled projection
   * (required for user/calendar path).
   */
  baseSnapshotVersion?: number
  paymentCollect?: string | null
  totalAmountMinor?: number | null
  paymentTermsSnapshot?: PaymentTermsSnapshot | null
  confirmationToken?: string | null
  quoteTokenHash?: string | null
  publicIdempotencyKey?: string | null
  /** Collect-now hold. Defaults to pending_sync + CRS enqueue. */
  reservationStatus?: 'pending_sync' | 'pending_payment'
  enqueueCrs?: boolean
  requireEmail?: boolean
  failClosedMissingAri?: boolean
  occupancyCap?: number
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const PRICE = /^\d+(\.\d{1,2})?$/

/** Stable Offline CRS code used for revision reconciliation (AE3). */
export function offlineReservationCode(
  networkId: number,
  reservationId: number,
): string {
  return `PMS-${networkId}-${reservationId}`
}

/** Local join keys stored on the reservation until paid CRS enqueue. */
export type PendingPublicCrs = {
  roomTypeChannexId: string
  ratePlanChannexId: string
  days: Record<string, string>
}

export type BookingCrsPayload = {
  property_id: string | null
  ota_reservation_code: string
  ota_name: 'Offline'
  arrival_date: string
  departure_date: string
  currency: string
  customer: { name: string; surname: string; mail?: string }
  rooms: Array<{
    room_type_id: string
    rate_plan_id: string
    days: Record<string, string>
    guests: Array<{ name: string; surname: string }>
    occupancy: { adults: number; children: number; infants: number }
  }>
  _local: { reservationId: number; roomTypeId: number }
}

export function pendingPublicCrsFromRaw(raw: unknown): PendingPublicCrs | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const pending = (raw as { pendingPublicCrs?: unknown }).pendingPublicCrs
  if (!pending || typeof pending !== 'object' || Array.isArray(pending)) return null
  const p = pending as Partial<PendingPublicCrs>
  if (
    !p.roomTypeChannexId?.trim() ||
    !p.ratePlanChannexId?.trim() ||
    !p.days ||
    typeof p.days !== 'object'
  ) {
    return null
  }
  return {
    roomTypeChannexId: p.roomTypeChannexId,
    ratePlanChannexId: p.ratePlanChannexId,
    days: p.days,
  }
}

export function attachPendingPublicCrs(
  raw: unknown,
  pending: PendingPublicCrs,
): Record<string, unknown> {
  const base =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? { ...(raw as Record<string, unknown>) }
      : {}
  return { ...base, pendingPublicCrs: pending }
}

export function buildBookingCrsPayload(input: {
  networkId: number
  reservationId: number
  roomTypeId: number
  checkInDate: string
  checkOutDate: string
  currency: string
  guestName: string
  guestEmail?: string | null
  adults: number
  children: number
  infants: number
  roomTypeChannexId: string
  ratePlanChannexId: string
  days: Record<string, string>
}): BookingCrsPayload {
  const guest = splitGuestName(input.guestName)
  const code = offlineReservationCode(input.networkId, input.reservationId)
  return {
    property_id: null,
    ota_reservation_code: code,
    ota_name: 'Offline',
    arrival_date: input.checkInDate,
    departure_date: input.checkOutDate,
    currency: input.currency,
    customer: {
      name: guest.name,
      surname: guest.surname,
      ...(input.guestEmail?.trim() ? { mail: input.guestEmail.trim() } : {}),
    },
    rooms: [
      {
        room_type_id: input.roomTypeChannexId,
        rate_plan_id: input.ratePlanChannexId,
        days: input.days,
        guests: [{ name: guest.name, surname: guest.surname }],
        occupancy: {
          adults: input.adults,
          children: input.children,
          infants: input.infants,
        },
      },
    ],
    _local: {
      reservationId: input.reservationId,
      roomTypeId: input.roomTypeId,
    },
  }
}

export function splitGuestName(full: string): { name: string; surname: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { name: 'Guest', surname: 'Guest' }
  if (parts.length === 1) return { name: parts[0]!, surname: parts[0]! }
  return { name: parts[0]!, surname: parts.slice(1).join(' ') }
}

/** Half-open stay nights [checkIn, checkOut). */
export function stayNightDates(checkIn: string, checkOut: string): string[] {
  const nights: string[] = []
  const cursor = new Date(`${checkIn}T00:00:00Z`)
  const end = new Date(`${checkOut}T00:00:00Z`)
  while (cursor < end) {
    nights.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return nights
}

/**
 * AE5: reject when projected Channex availability for the room type is 0
 * on any stay night (competing booking / closed inventory).
 */
export function assertRoomTypeVacancy(
  store: Pick<DomainStore, 'ariAvailability' | 'reservations'>,
  networkId: number,
  propertyId: number,
  roomTypeId: number,
  nights: readonly string[],
  options: { failClosedMissingAri?: boolean; nowMs?: number; freshnessMs?: number } = {},
): void {
  const nowMs = options.nowMs ?? Date.now()
  const freshnessMs = options.freshnessMs ?? ARI_FRESHNESS_MS
  for (const night of nights) {
    if (options.failClosedMissingAri) {
      const vacancy = publicVacancyForNight(store, {
        networkId,
        propertyId,
        roomTypeId,
        night,
        nowMs,
        freshnessMs,
      })
      if (!vacancy.ok || vacancy.remaining < 1) {
        throw {
          code: 'CONFLICT',
          message: `No vacancy for room type on ${night}`,
        }
      }
      continue
    }
    const rows = store.ariAvailability.filter(
      (a) =>
        a.networkId === networkId &&
        a.propertyId === propertyId &&
        a.roomTypeId === roomTypeId &&
        a.date === night,
    )
    if (rows.length === 0) continue
    const vacancy = publicVacancyForNight(store, {
      networkId,
      propertyId,
      roomTypeId,
      night,
      nowMs,
      freshnessMs: Number.MAX_SAFE_INTEGER,
    })
    if (!vacancy.ok || vacancy.remaining < 1) {
      throw {
        code: 'CONFLICT',
        message: `No vacancy for room type on ${night}`,
      }
    }
  }
}

function assertCrsFields(input: CreateDirectReservationInput): void {
  if (!ISO_DATE.test(input.checkInDate) || !ISO_DATE.test(input.checkOutDate)) {
    throw { code: 'VALIDATION', message: 'Dates must be YYYY-MM-DD' }
  }
  if (input.checkOutDate <= input.checkInDate) {
    throw { code: 'VALIDATION', message: 'checkOutDate must be after checkInDate' }
  }
  if (!input.guestName.trim()) {
    throw { code: 'VALIDATION', message: 'guestName is required' }
  }
  if (!input.roomTypeChannexId?.trim() || !input.ratePlanChannexId?.trim()) {
    throw {
      code: 'VALIDATION',
      message: 'roomTypeChannexId and ratePlanChannexId are required for Booking CRS',
    }
  }
  if (!Number.isFinite(input.roomTypeId) || input.roomTypeId < 1) {
    throw { code: 'VALIDATION', message: 'roomTypeId is required' }
  }
  const adults = input.adults ?? 1
  if (!Number.isFinite(adults) || adults < 1) {
    throw { code: 'VALIDATION', message: 'adults must be at least 1' }
  }
  if (input.requireEmail && !input.guestEmail?.trim()) {
    throw { code: 'VALIDATION', message: 'guestEmail is required' }
  }
  if (
    input.occupancyCap != null &&
    Number.isFinite(input.occupancyCap) &&
    adults > input.occupancyCap
  ) {
    throw { code: 'VALIDATION', message: 'adults exceed room capacity' }
  }
  const nights = stayNightDates(input.checkInDate, input.checkOutDate)
  if (nights.length === 0) {
    throw { code: 'VALIDATION', message: 'Stay must include at least one night' }
  }
  for (const night of nights) {
    const price = input.days?.[night]
    if (price == null || !PRICE.test(String(price))) {
      throw {
        code: 'VALIDATION',
        message: `Daily price required for ${night} (decimal string)`,
      }
    }
  }
}

/**
 * Direct/manual booking via Booking CRS — never silently local-only (R5/R6).
 * Stays pending_sync until a matching Channex revision commits (AE3).
 */
export const createDirectReservation: CommandDefinition<
  CreateDirectReservationInput,
  ReservationRecord
> = {
  name: 'createDirectReservation',
  module: 'reservations',
  allowedActorKinds: ['user', 'automation'],
  risk: 'high',
  requiresApproval: true,
  supportsDryRun: true,
  needsExternalSyncRecovery: true,
  compensatingAction: 'cancel_booking',
  fieldOwnership: { entity: 'reservations', mayMutate: 'both' },
  resolvePropertyId: (input) => input.propertyId,
  async execute(ctx, input, { store }) {
    assertCapability(store, ctx.networkId, 'bookingCrsWrite')
    assertCrsFields(input)

    if (input.baseSnapshotVersion !== undefined) {
      assertFreshSnapshot(store, ctx.networkId, input.baseSnapshotVersion)
    }

    const adults = input.adults ?? 1
    const children = input.children ?? 0
    const infants = input.infants ?? 0
    const guest = splitGuestName(input.guestName)
    const nights = stayNightDates(input.checkInDate, input.checkOutDate)
    assertRoomTypeVacancy(
      store,
      ctx.networkId,
      input.propertyId,
      input.roomTypeId,
      nights,
      { failClosedMissingAri: input.failClosedMissingAri === true },
    )
    const days: Record<string, string> = {}
    for (const night of nights) days[night] = String(input.days[night])

    const reservation: ReservationRecord = {
      id: store.nextId('reservation'),
      networkId: ctx.networkId,
      propertyId: input.propertyId,
      roomTypeId: input.roomTypeId,
      status: input.reservationStatus ?? 'pending_sync',
      checkInDate: input.checkInDate,
      checkOutDate: input.checkOutDate,
      currency: input.currency ?? 'USD',
      staffNotes: null,
      channexBookingId: null,
      pendingSyncReason:
        input.reservationStatus === 'pending_payment'
          ? 'public_booking_awaiting_payment'
          : 'direct_booking_awaiting_channex',
      guestName: input.guestName.trim(),
      guestEmail: input.guestEmail?.trim() || null,
      adults,
      children,
      infants,
      channel: 'direct',
      paymentCollect: input.paymentCollect ?? null,
      paymentType: null,
      totalAmountMinor: input.totalAmountMinor ?? null,
      paymentTermsSnapshot: input.paymentTermsSnapshot ?? null,
      confirmationToken: input.confirmationToken ?? null,
      quoteTokenHash: input.quoteTokenHash ?? null,
      publicIdempotencyKey: input.publicIdempotencyKey ?? null,
      operationalStatus: null,
      checkedInAt: null,
      checkedOutAt: null,
      otaReservationCode: null,
    }

    const code = offlineReservationCode(ctx.networkId, reservation.id)
    reservation.otaReservationCode = code
    reservation.channexRaw = attachPendingPublicCrs(reservation.channexRaw, {
      roomTypeChannexId: input.roomTypeChannexId,
      ratePlanChannexId: input.ratePlanChannexId,
      days,
    })
    store.reservations.push(reservation)

    const bookingPayload = buildBookingCrsPayload({
      networkId: ctx.networkId,
      reservationId: reservation.id,
      roomTypeId: input.roomTypeId,
      checkInDate: input.checkInDate,
      checkOutDate: input.checkOutDate,
      currency: reservation.currency,
      guestName: input.guestName,
      guestEmail: input.guestEmail,
      adults,
      children,
      infants,
      roomTypeChannexId: input.roomTypeChannexId,
      ratePlanChannexId: input.ratePlanChannexId,
      days,
    })

    if (input.enqueueCrs !== false) {
      enqueueAriIntent(store, {
        networkId: ctx.networkId,
        propertyId: input.propertyId,
        lane: 'booking_crs',
        idempotencyKey: `booking_crs:${code}`,
        payload: bookingPayload,
        resourceScope: {
          roomTypeChannexId: input.roomTypeChannexId,
          ratePlanChannexId: input.ratePlanChannexId,
          dateFrom: input.checkInDate,
          dateTo: input.checkOutDate,
        },
        baseSnapshotVersion:
          input.baseSnapshotVersion !== undefined ? input.baseSnapshotVersion : null,
        actorPrincipalId: ctx.principal.userId ?? null,
      })
    }

    return {
      data: reservation,
      resourceType: 'reservation',
      resourceId: String(reservation.id),
    }
  },
}
