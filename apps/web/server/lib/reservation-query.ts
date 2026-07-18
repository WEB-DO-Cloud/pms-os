import {
  principalCanAccessProperty,
  type PrincipalContext,
} from '@pms/auth'
import type { ReservationRecord } from '@pms/domain'

export type ReservationListFilter = {
  propertyId?: number
  from?: string
  to?: string
  status?: string
}

/** Pure filter used by APIs and web flow tests. */
export function filterReservationsForPrincipal(
  reservations: readonly ReservationRecord[],
  principal: PrincipalContext,
  filter: ReservationListFilter = {},
): ReservationRecord[] {
  return reservations.filter((r) => {
    if (r.networkId !== principal.networkId) return false
    if (!principalCanAccessProperty(principal, r.propertyId)) return false
    if (filter.propertyId != null && r.propertyId !== filter.propertyId) return false
    if (filter.status && r.status !== filter.status) return false
    if (filter.from && r.checkOutDate <= filter.from) return false
    if (filter.to && r.checkInDate >= filter.to) return false
    return true
  })
}

export type DirectBookingWriteBackResult =
  | { ok: true; channexBookingId: string; reconciled: boolean }
  | { ok: false; reason: string }

/**
 * Apply Channex write-back outcome onto a pending direct booking.
 * HTTP acceptance alone must not confirm (AE3) — set reconciled:true only
 * after a matching booking revision commits.
 */
export function applyWriteBackResult(
  reservation: ReservationRecord,
  result: DirectBookingWriteBackResult,
): ReservationRecord {
  if (!result.ok) {
    reservation.status = 'pending_sync'
    reservation.pendingSyncReason = result.reason
    return reservation
  }
  reservation.channexBookingId = result.channexBookingId
  if (result.reconciled) {
    reservation.status = 'confirmed'
    reservation.pendingSyncReason = null
  } else {
    reservation.status = 'pending_sync'
    reservation.pendingSyncReason = 'awaiting_channex_revision'
  }
  return reservation
}

export type CalendarPropertyInput = {
  id: number
  name: string
  /** From Channex raw via propertyTypeFromRaw / isHotelPropertyType. */
  isHotel: boolean
}

export type CalendarRoomInput = {
  id: number
  propertyId: number
  roomTypeId: number
  roomTypeName: string
  label: string
  sortOrder: number
  archivedAt: string | null
}

export type CalendarRowKind = 'property' | 'room' | 'unassigned'

export type CalendarRow = {
  key: string
  kind: CalendarRowKind
  propertyId: number
  propertyName: string
  roomTypeId: number | null
  roomTypeName: string | null
  roomId: number | null
  label: string
  sortOrder: number
}

export type CalendarBar = {
  id: number
  propertyId: number
  propertyName: string
  roomId: number | null
  roomLabel: string | null
  rowKey: string
  guestName: string | null
  checkInDate: string
  checkOutDate: string
  status: string
  operationalStatus: string | null
  pendingSyncReason: string | null
  channel: string | null
}

export function toCalendarBars(
  reservations: readonly ReservationRecord[],
  properties: readonly { id: number; name: string }[],
) {
  const byId = new Map(properties.map((p) => [p.id, p.name]))
  return reservations.map((r) => ({
    id: r.id,
    propertyId: r.propertyId,
    propertyName: byId.get(r.propertyId) ?? `Property ${r.propertyId}`,
    guestName: r.guestName,
    checkInDate: r.checkInDate,
    checkOutDate: r.checkOutDate,
    status: r.status,
    operationalStatus: r.operationalStatus ?? null,
    pendingSyncReason: r.pendingSyncReason,
    channel: r.channel ?? null,
  }))
}

function unassignedKey(propertyId: number) {
  return `unassigned:${propertyId}`
}

function roomKey(roomId: number) {
  return `room:${roomId}`
}

function propertyKey(propertyId: number) {
  return `property:${propertyId}`
}

/**
 * Build mixed calendar lanes: hotel → physical rooms (+ unassigned when needed);
 * vacation rental → one property row.
 */
export function buildCalendarProjection(
  properties: readonly CalendarPropertyInput[],
  rooms: readonly CalendarRoomInput[],
  reservations: readonly ReservationRecord[],
): { rows: CalendarRow[]; bars: CalendarBar[] } {
  const propById = new Map(properties.map((p) => [p.id, p]))
  const roomById = new Map(rooms.map((r) => [r.id, r]))
  const rows: CalendarRow[] = []

  for (const property of properties) {
    if (!property.isHotel) {
      rows.push({
        key: propertyKey(property.id),
        kind: 'property',
        propertyId: property.id,
        propertyName: property.name,
        roomTypeId: null,
        roomTypeName: null,
        roomId: null,
        label: property.name,
        sortOrder: 0,
      })
      continue
    }

    const propertyRooms = rooms
      .filter((r) => r.propertyId === property.id && !r.archivedAt)
      .slice()
      .sort(
        (a, b) =>
          a.roomTypeName.localeCompare(b.roomTypeName) ||
          a.sortOrder - b.sortOrder ||
          a.id - b.id,
      )

    for (const room of propertyRooms) {
      rows.push({
        key: roomKey(room.id),
        kind: 'room',
        propertyId: property.id,
        propertyName: property.name,
        roomTypeId: room.roomTypeId,
        roomTypeName: room.roomTypeName,
        roomId: room.id,
        label: room.label,
        sortOrder: room.sortOrder,
      })
    }

    const needsUnassigned = reservations.some(
      (r) =>
        r.propertyId === property.id &&
        (r.roomId == null || !roomById.has(r.roomId) || roomById.get(r.roomId)?.archivedAt),
    )
    if (needsUnassigned || propertyRooms.length === 0) {
      rows.push({
        key: unassignedKey(property.id),
        kind: 'unassigned',
        propertyId: property.id,
        propertyName: property.name,
        roomTypeId: null,
        roomTypeName: null,
        roomId: null,
        label: 'Unassigned / conflict',
        sortOrder: 9999,
      })
    }
  }

  const bars: CalendarBar[] = reservations.map((r) => {
    const property = propById.get(r.propertyId)
    const propertyName = property?.name ?? `Property ${r.propertyId}`
    const room = r.roomId != null ? roomById.get(r.roomId) : null
    const isHotel = property?.isHotel ?? false

    let rowKey: string
    let roomLabel: string | null = null
    if (!isHotel) {
      rowKey = propertyKey(r.propertyId)
    } else if (room && !room.archivedAt) {
      rowKey = roomKey(room.id)
      roomLabel = room.label
    } else {
      rowKey = unassignedKey(r.propertyId)
      roomLabel = 'Unassigned'
    }

    return {
      id: r.id,
      propertyId: r.propertyId,
      propertyName,
      roomId: room && !room.archivedAt ? room.id : null,
      roomLabel,
      rowKey,
      guestName: r.guestName,
      checkInDate: r.checkInDate,
      checkOutDate: r.checkOutDate,
      status: r.status,
      operationalStatus: r.operationalStatus ?? null,
      pendingSyncReason: r.pendingSyncReason,
      channel: r.channel ?? null,
    }
  })

  return { rows, bars }
}

export function isPendingSync(reservation: Pick<ReservationRecord, 'status'>): boolean {
  return reservation.status === 'pending_sync'
}

/** Channex availability older than this is advisory only, never authoritative. */
const ARI_FRESHNESS_MS = 60 * 60 * 1000

/** Structural subsets so tests and callers can pass domain records directly. */
export type CalendarAriInputs = {
  availability: readonly {
    propertyId: number
    roomTypeId: number
    date: string
    availability: number
    pulledAt: string
  }[]
  restrictions: readonly {
    propertyId: number
    ratePlanChannexId: string
    date: string
    rateMinor: number | null
    minStayArrival: number | null
    stopSell: boolean | null
    closedToArrival: boolean | null
    closedToDeparture: boolean | null
  }[]
  ratePlans: readonly {
    propertyId: number
    channexId: string
    parentRatePlanChannexId: string | null
    currency: string | null
  }[]
}

export type CalendarDaySummary = {
  propertyId: number
  date: string
  /** Active physical units (VR = 1). */
  capacity: number
  /** Overlapping non-cancelled stays (half-open; check-out day free). */
  booked: number
  pendingSync: number
  vacancy: number
  vacancySource: 'channex' | 'reservations'
  /** True when vacancy is reservation-derived rather than reconciled Channex data. */
  degraded: boolean
  /** Representative nightly rate from a parent/manual plan; derived plans excluded. */
  rateMinor: number | null
  currency: string | null
  minStay: number | null
  stopSell: boolean
  closedToArrival: boolean
  closedToDeparture: boolean
  hasRoomMapping: boolean
  hasRateMapping: boolean
}

/**
 * Per property/date overlay for the calendar: vacancy, representative rate,
 * restriction markers, and freshness (R1-R4, AE1). Fresh Channex availability
 * is authoritative; otherwise vacancy falls back to capacity minus stays and
 * is labelled degraded.
 */
export function buildCalendarDaySummaries(
  properties: readonly CalendarPropertyInput[],
  rooms: readonly Pick<CalendarRoomInput, 'propertyId' | 'archivedAt'>[],
  reservations: readonly ReservationRecord[],
  ariInputs: CalendarAriInputs,
  dates: readonly string[],
  nowMs = Date.now(),
): CalendarDaySummary[] {
  const out: CalendarDaySummary[] = []
  for (const property of properties) {
    const activeRooms = rooms.filter(
      (r) => r.propertyId === property.id && !r.archivedAt,
    ).length
    const hasRoomMapping = !property.isHotel || activeRooms > 0
    const capacity = property.isHotel ? Math.max(1, activeRooms) : 1
    const parentPlans = ariInputs.ratePlans.filter(
      (p) => p.propertyId === property.id && p.parentRatePlanChannexId == null,
    )
    const stays = reservations.filter(
      (r) =>
        r.propertyId === property.id &&
        r.status !== 'cancelled' &&
        r.status !== 'no_show',
    )

    for (const date of dates) {
      const overlapping = stays.filter(
        (r) => r.checkInDate <= date && r.checkOutDate > date,
      )
      const booked = overlapping.length
      const pendingSync = overlapping.filter(isPendingSync).length

      const availRows = ariInputs.availability.filter(
        (a) => a.propertyId === property.id && a.date === date,
      )
      const fresh =
        availRows.length > 0 &&
        availRows.every((a) => nowMs - Date.parse(a.pulledAt) <= ARI_FRESHNESS_MS)
      const vacancy = fresh
        ? availRows.reduce((sum, a) => sum + a.availability, 0)
        : Math.max(0, capacity - booked)

      const rep = parentPlans
        .map((plan) =>
          ariInputs.restrictions.find(
            (r) =>
              r.propertyId === property.id &&
              r.ratePlanChannexId === plan.channexId &&
              r.date === date,
          ),
        )
        .find((r) => r != null)
      const repPlan = rep
        ? parentPlans.find((p) => p.channexId === rep.ratePlanChannexId)
        : null

      out.push({
        propertyId: property.id,
        date,
        capacity,
        booked,
        pendingSync,
        vacancy,
        vacancySource: fresh ? 'channex' : 'reservations',
        degraded: !fresh,
        rateMinor: rep?.rateMinor ?? null,
        currency: repPlan?.currency ?? null,
        minStay: rep?.minStayArrival ?? null,
        stopSell: rep?.stopSell ?? false,
        closedToArrival: rep?.closedToArrival ?? false,
        closedToDeparture: rep?.closedToDeparture ?? false,
        hasRoomMapping,
        hasRateMapping: parentPlans.length > 0,
      })
    }
  }
  return out
}
