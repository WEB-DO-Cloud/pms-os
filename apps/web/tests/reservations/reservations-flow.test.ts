import { describe, expect, it } from 'vitest'
import { buildPrincipal } from '@pms/auth'
import { createMemoryStore, runCommand, type ReservationRecord } from '@pms/domain'
import {
  applyWriteBackResult,
  buildCalendarProjection,
  filterReservationsForPrincipal,
  isPendingSync,
  toCalendarBars,
} from '../../server/lib/reservation-query'

function principal(
  overrides: Partial<Parameters<typeof buildPrincipal>[0]> = {},
) {
  return buildPrincipal({
    userId: 'desk-1',
    networkId: 1,
    role: 'front_desk',
    propertyIds: [10, 11],
    networkWide: false,
    ...overrides,
  })!
}

function reservation(
  partial: Partial<ReservationRecord> & Pick<ReservationRecord, 'id' | 'propertyId'>,
): ReservationRecord {
  return {
    networkId: 1,
    status: 'confirmed',
    checkInDate: '2026-07-20',
    checkOutDate: '2026-07-22',
    currency: 'USD',
    staffNotes: null,
    channexBookingId: 'bk',
    pendingSyncReason: null,
    guestName: 'Guest',
    ...partial,
  }
}

describe('reservation property scope', () => {
  it('hides inaccessible properties from calendar/list projections', () => {
    const rows = [
      reservation({ id: 1, propertyId: 10, guestName: 'In scope' }),
      reservation({ id: 2, propertyId: 99, guestName: 'Hidden' }),
      reservation({ id: 3, propertyId: 11, guestName: 'Also in' }),
    ]
    const scoped = filterReservationsForPrincipal(rows, principal())
    expect(scoped.map((r) => r.id)).toEqual([1, 3])

    const bars = toCalendarBars(scoped, [
      { id: 10, name: 'Casa' },
      { id: 11, name: 'Nacar' },
      { id: 99, name: 'Secret' },
    ])
    expect(bars.every((b) => b.propertyId === 10 || b.propertyId === 11)).toBe(true)
    expect(bars.find((b) => b.propertyId === 99)).toBeUndefined()
  })

  it('respects explicit property filter within scope', () => {
    const rows = [
      reservation({ id: 1, propertyId: 10 }),
      reservation({ id: 2, propertyId: 11 }),
    ]
    const only = filterReservationsForPrincipal(rows, principal(), { propertyId: 10 })
    expect(only).toHaveLength(1)
    expect(only[0]?.propertyId).toBe(10)
  })
})

describe('pending-sync direct booking semantics', () => {
  it('failed Channex write keeps pending_sync and never looks confirmed', async () => {
    const store = createMemoryStore()
    const user = principal()
    const created = await runCommand(
      'createDirectReservation',
      {
        principal: user,
        actorKind: 'user',
        networkId: 1,
        propertyId: 10,
      },
      {
        propertyId: 10,
        checkInDate: '2026-08-01',
        checkOutDate: '2026-08-03',
        guestName: 'Direct',
      },
      { store },
    )
    expect(created.status).toBe('ok')
    const row = store.reservations[0]!
    expect(isPendingSync(row)).toBe(true)

    applyWriteBackResult(row, { ok: false, reason: 'channex_write_failed' })
    expect(row.status).toBe('pending_sync')
    expect(row.pendingSyncReason).toBe('channex_write_failed')
    expect(row.status).not.toBe('confirmed')
  })

  it('successful write-back promotes to confirmed with Channex id', () => {
    const row = reservation({
      id: 9,
      propertyId: 10,
      status: 'pending_sync',
      channexBookingId: null,
      pendingSyncReason: 'direct_booking_awaiting_channex',
    })
    applyWriteBackResult(row, { ok: true, channexBookingId: 'CHX-100' })
    expect(row.status).toBe('confirmed')
    expect(row.channexBookingId).toBe('CHX-100')
    expect(row.pendingSyncReason).toBeNull()
    expect(isPendingSync(row)).toBe(false)
  })

  it('date-range filter keeps overlapping stays for calendar', () => {
    const rows = [
      reservation({ id: 1, propertyId: 10, checkInDate: '2026-07-18', checkOutDate: '2026-07-21' }),
      reservation({ id: 2, propertyId: 10, checkInDate: '2026-07-25', checkOutDate: '2026-07-28' }),
    ]
    const week = filterReservationsForPrincipal(rows, principal(), {
      from: '2026-07-20',
      to: '2026-07-24',
    })
    expect(week.map((r) => r.id)).toEqual([1])
  })
})

describe('mixed hotel / vacation-rental calendar projection', () => {
  it('expands hotels into room rows and keeps VR as property rows', () => {
    const { rows, bars } = buildCalendarProjection(
      [
        { id: 10, name: 'Grand Hotel', isHotel: true },
        { id: 11, name: 'Beach Villa', isHotel: false },
      ],
      [
        {
          id: 101,
          propertyId: 10,
          roomTypeId: 1,
          roomTypeName: 'King',
          label: '101',
          sortOrder: 1,
          archivedAt: null,
        },
        {
          id: 102,
          propertyId: 10,
          roomTypeId: 1,
          roomTypeName: 'King',
          label: '102',
          sortOrder: 2,
          archivedAt: null,
        },
      ],
      [
        reservation({
          id: 1,
          propertyId: 10,
          roomId: 101,
          guestName: 'Hotel Guest',
        }),
        reservation({
          id: 2,
          propertyId: 10,
          roomId: null,
          guestName: 'Overflow',
        }),
        reservation({
          id: 3,
          propertyId: 11,
          guestName: 'VR Guest',
        }),
      ],
    )

    expect(rows.map((r) => r.key)).toEqual([
      'room:101',
      'room:102',
      'unassigned:10',
      'property:11',
    ])
    expect(bars.find((b) => b.id === 1)?.rowKey).toBe('room:101')
    expect(bars.find((b) => b.id === 2)?.rowKey).toBe('unassigned:10')
    expect(bars.find((b) => b.id === 3)?.rowKey).toBe('property:11')
  })

  it('ignores archived rooms and routes those bars to unassigned', () => {
    const { rows, bars } = buildCalendarProjection(
      [{ id: 10, name: 'Hotel', isHotel: true }],
      [
        {
          id: 1,
          propertyId: 10,
          roomTypeId: 1,
          roomTypeName: 'Std',
          label: '1',
          sortOrder: 1,
          archivedAt: '2026-07-01T00:00:00.000Z',
        },
        {
          id: 2,
          propertyId: 10,
          roomTypeId: 1,
          roomTypeName: 'Std',
          label: '2',
          sortOrder: 2,
          archivedAt: null,
        },
      ],
      [reservation({ id: 9, propertyId: 10, roomId: 1 })],
    )
    expect(rows.some((r) => r.key === 'room:1')).toBe(false)
    expect(rows.some((r) => r.key === 'room:2')).toBe(true)
    expect(bars[0]?.rowKey).toBe('unassigned:10')
  })
})
