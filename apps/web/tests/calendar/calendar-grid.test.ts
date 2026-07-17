import { describe, expect, it } from 'vitest'
import { buildCalendarProjection } from '../../server/lib/reservation-query'
import type { ReservationRecord } from '@pms/domain'

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

/** Mirror CalendarGrid horizon grouping for stable regression coverage. */
function horizonBlocks(
  rows: ReturnType<typeof buildCalendarProjection>['rows'],
) {
  const blocks: Array<
    | { type: 'property'; name: string }
    | { type: 'roomType'; name: string }
    | { type: 'row'; key: string; label: string }
  > = []
  let lastPropertyId: number | null = null
  let lastRoomTypeId: number | null = null
  for (const row of rows) {
    if (row.propertyId !== lastPropertyId) {
      blocks.push({ type: 'property', name: row.propertyName })
      lastPropertyId = row.propertyId
      lastRoomTypeId = null
    }
    if (row.kind === 'room' && row.roomTypeId != null && row.roomTypeId !== lastRoomTypeId) {
      blocks.push({ type: 'roomType', name: row.roomTypeName ?? 'Rooms' })
      lastRoomTypeId = row.roomTypeId
    }
    blocks.push({ type: 'row', key: row.key, label: row.label })
  }
  return blocks
}

function chipMeta(bar: { propertyName: string; roomLabel?: string | null }) {
  if (bar.roomLabel) return `${bar.propertyName} · ${bar.roomLabel}`
  return bar.propertyName
}

describe('calendar grid grouping', () => {
  it('groups hotel rooms under property and room-type headers', () => {
    const { rows, bars } = buildCalendarProjection(
      [
        { id: 1, name: 'Grand', isHotel: true },
        { id: 2, name: 'Villa', isHotel: false },
      ],
      [
        {
          id: 10,
          propertyId: 1,
          roomTypeId: 5,
          roomTypeName: 'King',
          label: '101',
          sortOrder: 1,
          archivedAt: null,
        },
        {
          id: 11,
          propertyId: 1,
          roomTypeId: 5,
          roomTypeName: 'King',
          label: '102',
          sortOrder: 2,
          archivedAt: null,
        },
        {
          id: 12,
          propertyId: 1,
          roomTypeId: 6,
          roomTypeName: 'Twin',
          label: '201',
          sortOrder: 1,
          archivedAt: null,
        },
      ],
      [
        reservation({ id: 1, propertyId: 1, roomId: 10, guestName: 'Ada' }),
        reservation({ id: 2, propertyId: 1, roomId: null, guestName: 'Overflow' }),
        reservation({ id: 3, propertyId: 2, guestName: 'VR' }),
      ],
    )

    const blocks = horizonBlocks(rows)
    expect(blocks.filter((b) => b.type === 'property').map((b) => b.name)).toEqual([
      'Grand',
      'Villa',
    ])
    expect(blocks.filter((b) => b.type === 'roomType').map((b) => b.name)).toEqual([
      'King',
      'Twin',
    ])
    expect(blocks.some((b) => b.type === 'row' && b.label === 'Unassigned / conflict')).toBe(
      true,
    )
    expect(chipMeta(bars.find((b) => b.id === 1)!)).toBe('Grand · 101')
    expect(chipMeta(bars.find((b) => b.id === 2)!)).toBe('Grand · Unassigned')
    expect(chipMeta(bars.find((b) => b.id === 3)!)).toBe('Villa')
  })
})
