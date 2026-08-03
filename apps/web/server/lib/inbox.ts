import type { ReservationRecord } from '@pms/domain'

export type InboxReservationView = {
  id: number
  propertyId: number
  propertyName: string
  guestName: string | null
  guestEmail: string | null
  guestPhone: string | null
  status: string
  operationalStatus: string | null
  checkInDate: string
  checkOutDate: string
  adults: number
  children: number
  infants: number
  channel: string | null
}

function stringAt(value: unknown, paths: string[][]): string | null {
  for (const path of paths) {
    let current: unknown = value
    for (const key of path) {
      if (!current || typeof current !== 'object') {
        current = null
        break
      }
      current = (current as Record<string, unknown>)[key]
    }
    if (typeof current === 'string' && current.trim()) return current.trim()
  }
  return null
}

export function guestPhoneFromRaw(raw: unknown): string | null {
  return stringAt(raw, [
    ['attributes', 'customer', 'phone'],
    ['attributes', 'customer', 'phone_number'],
    ['customer', 'phone'],
    ['customer', 'phone_number'],
  ])
}

export function toInboxReservation(
  reservation: ReservationRecord,
  propertyName: string,
): InboxReservationView {
  return {
    id: reservation.id,
    propertyId: reservation.propertyId,
    propertyName,
    guestName: reservation.guestName,
    guestEmail: reservation.guestEmail ?? null,
    guestPhone: guestPhoneFromRaw(reservation.channexRaw),
    status: reservation.status,
    operationalStatus: reservation.operationalStatus ?? null,
    checkInDate: reservation.checkInDate,
    checkOutDate: reservation.checkOutDate,
    adults: reservation.adults ?? 0,
    children: reservation.children ?? 0,
    infants: reservation.infants ?? 0,
    channel: reservation.channel ?? null,
  }
}

export function reservationStatusLine(
  reservation: Pick<
    InboxReservationView,
    'status' | 'operationalStatus' | 'checkInDate' | 'checkOutDate'
  > | null,
  today = new Date().toISOString().slice(0, 10),
): string {
  if (!reservation) return 'Inquiry · no booking'
  if (reservation.status === 'cancelled') return 'Cancelled'
  if (
    reservation.operationalStatus === 'checked_out' ||
    reservation.checkOutDate < today
  ) {
    return `Checked out · ${reservation.checkOutDate}`
  }
  if (reservation.operationalStatus === 'checked_in') {
    return `In house · until ${reservation.checkOutDate}`
  }
  if (reservation.checkInDate === today) return 'Check-in today'
  if (reservation.checkInDate < today && reservation.checkOutDate >= today) {
    return `In house · until ${reservation.checkOutDate}`
  }
  return `Upcoming · ${reservation.checkInDate} → ${reservation.checkOutDate}`
}

export function unreadGuestCount(
  messages: readonly { sender: string; receivedAt: string }[],
  lastReadAt: string | null,
): number {
  return messages.filter(
    (message) =>
      message.sender === 'guest' &&
      (lastReadAt == null || message.receivedAt > lastReadAt),
  ).length
}
