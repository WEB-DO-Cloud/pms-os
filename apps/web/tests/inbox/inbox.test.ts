import { describe, expect, it } from 'vitest'
import {
  guestPhoneFromRaw,
  reservationStatusLine,
  toInboxReservation,
  unreadGuestCount,
} from '../../server/lib/inbox'

describe('inbox conversation helpers', () => {
  it('counts only guest messages newer than the read marker', () => {
    const messages = [
      { sender: 'guest', receivedAt: '2026-07-17T10:00:00.000Z' },
      { sender: 'property', receivedAt: '2026-07-17T10:05:00.000Z' },
      { sender: 'guest', receivedAt: '2026-07-17T10:10:00.000Z' },
    ]
    expect(unreadGuestCount(messages, null)).toBe(2)
    expect(unreadGuestCount(messages, '2026-07-17T10:01:00.000Z')).toBe(1)
    expect(unreadGuestCount(messages, '2026-07-17T10:10:00.000Z')).toBe(0)
  })

  it('builds operational status lines from reservation dates', () => {
    const upcoming = {
      status: 'confirmed',
      operationalStatus: null,
      checkInDate: '2026-07-20',
      checkOutDate: '2026-07-23',
    }
    expect(reservationStatusLine(null, '2026-07-17')).toBe('Inquiry · no booking')
    expect(reservationStatusLine(upcoming, '2026-07-17')).toBe(
      'Upcoming · 2026-07-20 → 2026-07-23',
    )
    expect(
      reservationStatusLine(
        { ...upcoming, checkInDate: '2026-07-17' },
        '2026-07-17',
      ),
    ).toBe('Check-in today')
    expect(
      reservationStatusLine(
        { ...upcoming, operationalStatus: 'checked_out' },
        '2026-07-17',
      ),
    ).toBe('Checked out · 2026-07-23')
  })

  it('extracts guest phone from common Channex payload shapes', () => {
    expect(
      guestPhoneFromRaw({
        attributes: { customer: { phone_number: '+1 809 555 0101' } },
      }),
    ).toBe('+1 809 555 0101')
    expect(guestPhoneFromRaw({ customer: { phone: '+44 20 1234 5678' } })).toBe(
      '+44 20 1234 5678',
    )
  })

  it('projects reservation context for the right panel', () => {
    const view = toInboxReservation(
      {
        id: 8,
        networkId: 1,
        propertyId: 2,
        status: 'confirmed',
        checkInDate: '2026-08-01',
        checkOutDate: '2026-08-04',
        currency: 'USD',
        staffNotes: null,
        channexBookingId: 'booking-1',
        pendingSyncReason: null,
        guestName: 'Ada Guest',
        guestEmail: 'ada@example.com',
        adults: 2,
        children: 1,
        channel: 'AirBNB',
        channexRaw: { customer: { phone: '+18095550101' } },
      },
      'Ocean Villa',
    )
    expect(view).toMatchObject({
      propertyName: 'Ocean Villa',
      guestName: 'Ada Guest',
      guestPhone: '+18095550101',
      adults: 2,
      children: 1,
      channel: 'AirBNB',
    })
  })
})
