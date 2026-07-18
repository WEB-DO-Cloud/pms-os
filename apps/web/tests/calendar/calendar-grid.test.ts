import { describe, expect, it } from 'vitest'
import {
  buildCalendarDaySummaries,
  buildCalendarProjection,
  type CalendarAriInputs,
} from '../../server/lib/reservation-query'
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

const NOW = Date.parse('2026-08-01T12:00:00.000Z')
const FRESH = '2026-08-01T11:45:00.000Z'
const STALE = '2026-08-01T09:00:00.000Z'

const twoRooms = [
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
]

function ari(partial: Partial<CalendarAriInputs> = {}): CalendarAriInputs {
  return { availability: [], restrictions: [], ratePlans: [], ...partial }
}

describe('calendar day summaries', () => {
  it('AE1: capacity two with one overlapping confirmed stay renders one vacancy', () => {
    const days = buildCalendarDaySummaries(
      [{ id: 1, name: 'Grand', isHotel: true }],
      twoRooms,
      [
        reservation({
          id: 1,
          propertyId: 1,
          checkInDate: '2026-08-01',
          checkOutDate: '2026-08-03',
        }),
      ],
      ari(),
      ['2026-08-01', '2026-08-02', '2026-08-03'],
      NOW,
    )
    const d1 = days.find((d) => d.date === '2026-08-01')!
    expect(d1).toMatchObject({
      propertyId: 1,
      capacity: 2,
      booked: 1,
      vacancy: 1,
      vacancySource: 'reservations',
      degraded: true,
    })
    // Half-open stays: check-out day does not consume vacancy.
    expect(days.find((d) => d.date === '2026-08-03')).toMatchObject({
      booked: 0,
      vacancy: 2,
    })
  })

  it('cancelled stays never consume vacancy; pending-sync stays do and are counted', () => {
    const days = buildCalendarDaySummaries(
      [{ id: 1, name: 'Grand', isHotel: true }],
      twoRooms,
      [
        reservation({
          id: 1,
          propertyId: 1,
          status: 'cancelled',
          checkInDate: '2026-08-01',
          checkOutDate: '2026-08-02',
        }),
        reservation({
          id: 2,
          propertyId: 1,
          status: 'pending_sync',
          checkInDate: '2026-08-01',
          checkOutDate: '2026-08-02',
        }),
      ],
      ari(),
      ['2026-08-01'],
      NOW,
    )
    expect(days[0]).toMatchObject({ booked: 1, pendingSync: 1, vacancy: 1 })
  })

  it('fresh Channex availability overrides reservation math; stale falls back degraded', () => {
    const availability = (pulledAt: string) => [
      { propertyId: 1, roomTypeId: 5, date: '2026-08-01', availability: 0, pulledAt },
    ]
    const stays = [
      reservation({
        id: 1,
        propertyId: 1,
        checkInDate: '2026-08-01',
        checkOutDate: '2026-08-02',
      }),
    ]
    const props = [{ id: 1, name: 'Grand', isHotel: true }]

    const fresh = buildCalendarDaySummaries(
      props,
      twoRooms,
      stays,
      ari({ availability: availability(FRESH) }),
      ['2026-08-01'],
      NOW,
    )
    expect(fresh[0]).toMatchObject({
      vacancy: 0,
      vacancySource: 'channex',
      degraded: false,
    })

    const stale = buildCalendarDaySummaries(
      props,
      twoRooms,
      stays,
      ari({ availability: availability(STALE) }),
      ['2026-08-01'],
      NOW,
    )
    expect(stale[0]).toMatchObject({
      vacancy: 1,
      vacancySource: 'reservations',
      degraded: true,
    })
  })

  it('projects representative parent-plan rate and restriction markers per date', () => {
    const days = buildCalendarDaySummaries(
      [{ id: 1, name: 'Villa', isHotel: false }],
      [],
      [],
      ari({
        ratePlans: [
          {
            propertyId: 1,
            channexId: 'plan-derived',
            parentRatePlanChannexId: 'plan-parent',
            currency: 'USD',
          },
          {
            propertyId: 1,
            channexId: 'plan-parent',
            parentRatePlanChannexId: null,
            currency: 'USD',
          },
        ],
        restrictions: [
          {
            propertyId: 1,
            ratePlanChannexId: 'plan-parent',
            date: '2026-08-01',
            rateMinor: 20_000,
            minStayArrival: 2,
            stopSell: true,
            closedToArrival: false,
            closedToDeparture: null,
          },
          {
            propertyId: 1,
            ratePlanChannexId: 'plan-derived',
            date: '2026-08-01',
            rateMinor: 24_000,
            minStayArrival: null,
            stopSell: false,
            closedToArrival: null,
            closedToDeparture: null,
          },
        ],
      }),
      ['2026-08-01', '2026-08-02'],
      NOW,
    )
    // Derived channel plans never drive the calendar's representative rate.
    expect(days.find((d) => d.date === '2026-08-01')).toMatchObject({
      rateMinor: 20_000,
      currency: 'USD',
      minStay: 2,
      stopSell: true,
      hasRateMapping: true,
    })
    expect(days.find((d) => d.date === '2026-08-02')).toMatchObject({
      rateMinor: null,
      stopSell: false,
    })
  })

  it('flags missing room and rate mappings so the UI can disable only those actions', () => {
    const days = buildCalendarDaySummaries(
      [{ id: 1, name: 'Bare', isHotel: true }],
      [],
      [],
      ari(),
      ['2026-08-01'],
      NOW,
    )
    expect(days[0]).toMatchObject({
      capacity: 1,
      hasRoomMapping: false,
      hasRateMapping: false,
    })
  })
})
