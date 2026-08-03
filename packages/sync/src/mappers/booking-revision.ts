import type { ApplyChannexBookingRevisionInput } from '@pms/domain'
import type { ChannexBookingRevisionAttrs } from '../channex/types'

export type RevisionMapResult =
  | { ok: true; input: ApplyChannexBookingRevisionInput }
  | { ok: false; code: 'UNMAPPED_PROPERTY' | 'UNMAPPED_ROOM_TYPE'; message: string }

export function guestNameFromRevision(attrs: ChannexBookingRevisionAttrs): string | undefined {
  const c = attrs.customer
  if (!c) return undefined
  const parts = [c.name, c.surname].filter(Boolean)
  return parts.length ? parts.join(' ') : undefined
}

export function mapChannexBookingRevision(
  propertyId: number,
  attrs: ChannexBookingRevisionAttrs,
  raw: unknown,
  roomTypeId: number | null = null,
): RevisionMapResult {
  if (!propertyId) {
    return { ok: false, code: 'UNMAPPED_PROPERTY', message: 'Property not mapped locally' }
  }

  const input: ApplyChannexBookingRevisionInput = {
    propertyId,
    channexRevisionId: attrs.id,
    channexBookingId: attrs.booking_id,
    revisionStatus: attrs.status,
    checkInDate: attrs.arrival_date,
    checkOutDate: attrs.departure_date,
    guestName: guestNameFromRevision(attrs),
    adults: attrs.occupancy?.adults ?? 1,
    children: attrs.occupancy?.children ?? 0,
    infants: attrs.occupancy?.infants ?? 0,
    currency: attrs.currency ?? 'USD',
    payload: raw,
    roomTypeId,
    otaReservationCode: attrs.ota_reservation_code ?? null,
  }

  return { ok: true, input }
}

export function requiresRoomTypeMapping(attrs: ChannexBookingRevisionAttrs): boolean {
  return Boolean(attrs.room_type_id)
}
