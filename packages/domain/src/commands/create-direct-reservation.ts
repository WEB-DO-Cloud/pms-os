import { assertCapability, assertFreshSnapshot, enqueueAriIntent } from '../ari'
import type { CommandDefinition, DomainStore, ReservationRecord } from '../store'

export type CreateDirectReservationInput = {
  propertyId: number
  checkInDate: string
  checkOutDate: string
  guestName: string
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
  store: Pick<DomainStore, 'ariAvailability'>,
  networkId: number,
  propertyId: number,
  roomTypeId: number,
  nights: readonly string[],
): void {
  for (const night of nights) {
    const rows = store.ariAvailability.filter(
      (a) =>
        a.networkId === networkId &&
        a.propertyId === propertyId &&
        a.roomTypeId === roomTypeId &&
        a.date === night,
    )
    if (rows.length === 0) continue
    const sum = rows.reduce((s, r) => s + r.availability, 0)
    if (sum === 0 || rows.some((r) => r.availability === 0)) {
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
    )
    const days: Record<string, string> = {}
    for (const night of nights) days[night] = String(input.days[night])

    const reservation: ReservationRecord = {
      id: store.nextId('reservation'),
      networkId: ctx.networkId,
      propertyId: input.propertyId,
      roomTypeId: input.roomTypeId,
      status: 'pending_sync',
      checkInDate: input.checkInDate,
      checkOutDate: input.checkOutDate,
      currency: input.currency ?? 'USD',
      staffNotes: null,
      channexBookingId: null,
      pendingSyncReason: 'direct_booking_awaiting_channex',
      guestName: input.guestName.trim(),
      guestEmail: null,
      adults,
      children,
      infants,
      channel: 'direct',
      paymentCollect: null,
      paymentType: null,
      totalAmountMinor: null,
      operationalStatus: null,
      checkedInAt: null,
      checkedOutAt: null,
      otaReservationCode: null,
    }

    const code = offlineReservationCode(ctx.networkId, reservation.id)
    reservation.otaReservationCode = code
    store.reservations.push(reservation)

    // Absolute Booking CRS payload; worker/write-back sends this once.
    const bookingPayload = {
      property_id: null as string | null, // filled at send with mapped Channex property id
      ota_reservation_code: code,
      ota_name: 'Offline' as const,
      arrival_date: input.checkInDate,
      departure_date: input.checkOutDate,
      currency: reservation.currency,
      customer: { name: guest.name, surname: guest.surname },
      rooms: [
        {
          room_type_id: input.roomTypeChannexId,
          rate_plan_id: input.ratePlanChannexId,
          days,
          guests: [{ name: guest.name, surname: guest.surname }],
          occupancy: { adults, children, infants },
        },
      ],
      // Local join keys for write-back / resume (not sent to Channex).
      _local: {
        reservationId: reservation.id,
        roomTypeId: input.roomTypeId,
      },
    }

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

    return {
      data: reservation,
      resourceType: 'reservation',
      resourceId: String(reservation.id),
    }
  },
}
