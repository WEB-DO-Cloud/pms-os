import { describe, expect, it } from 'vitest'
import { buildPrincipal } from '@pms/auth'
import {
  computeReportSummary,
  formatMoneyMinor,
  isSyncDataStale,
  overlappingStayNights,
  stayNights,
  type ReservationRecord,
} from './index'

function principal(
  overrides: Partial<Parameters<typeof buildPrincipal>[0]> = {},
) {
  return buildPrincipal({
    userId: 'rev-1',
    networkId: 1,
    role: 'accounting',
    propertyIds: [10, 11],
    networkWide: false,
    ...overrides,
  })!
}

function reservation(
  partial: Partial<ReservationRecord> &
    Pick<ReservationRecord, 'id' | 'propertyId'>,
): ReservationRecord {
  return {
    networkId: 1,
    status: 'confirmed',
    checkInDate: '2026-07-01',
    checkOutDate: '2026-07-05',
    currency: 'USD',
    staffNotes: null,
    channexBookingId: 'bk',
    pendingSyncReason: null,
    guestName: 'Guest',
    channel: 'airbnb',
    totalAmountMinor: 40_000,
    ...partial,
  }
}

describe('money / date helpers', () => {
  it('formats minor units without float drift', () => {
    expect(formatMoneyMinor(1050, 'USD')).toBe('10.50 USD')
    expect(formatMoneyMinor(-99, 'DOP')).toBe('-0.99 DOP')
  })

  it('counts exclusive check-out stay nights and range overlap', () => {
    expect(stayNights('2026-07-01', '2026-07-05')).toBe(4)
    expect(
      overlappingStayNights('2026-07-01', '2026-07-05', '2026-07-03', '2026-07-10'),
    ).toBe(2)
    expect(
      overlappingStayNights('2026-07-01', '2026-07-05', '2026-08-01', '2026-08-10'),
    ).toBe(0)
  })
})

describe('report summaries', () => {
  const freshness = {
    status: 'healthy' as const,
    lastPullAt: '2026-07-16T10:00:00.000Z',
    updatedAt: '2026-07-16T10:00:00.000Z',
  }
  const now = Date.parse('2026-07-16T12:00:00.000Z')

  it('calculates occupancy, ADR, RevPAR, and channel revenue from fixtures', () => {
    const rows = [
      reservation({
        id: 1,
        propertyId: 10,
        checkInDate: '2026-07-01',
        checkOutDate: '2026-07-05',
        totalAmountMinor: 40_000,
        channel: 'airbnb',
      }),
      reservation({
        id: 2,
        propertyId: 11,
        checkInDate: '2026-07-02',
        checkOutDate: '2026-07-04',
        totalAmountMinor: 20_000,
        channel: 'booking.com',
      }),
      reservation({
        id: 3,
        propertyId: 10,
        status: 'cancelled',
        totalAmountMinor: 99_000,
        channel: 'airbnb',
      }),
    ]

    const summary = computeReportSummary(
      rows,
      principal(),
      [
        { propertyId: 10, unitCount: 1, name: 'Casa' },
        { propertyId: 11, unitCount: 1, name: 'Nacar' },
      ],
      freshness,
      { from: '2026-07-01', to: '2026-07-10' },
      now,
    )

    // range = 10 days; 2 properties × 1 unit = 20 available nights
    // prop10: 4 nights / 40000; prop11: 2 nights / 20000
    expect(summary.occupiedNights).toBe(6)
    expect(summary.availableNights).toBe(20)
    expect(summary.revenueMinor).toBe(60_000)
    expect(summary.adrMinor).toBe(10_000) // 60000/6
    expect(summary.revparMinor).toBe(3_000) // 60000/20
    expect(summary.occupancyPct).toBe(30)
    expect(summary.byChannel.map((c) => c.channel)).toEqual([
      'airbnb',
      'booking.com',
    ])
    expect(summary.byProperty.find((p) => p.propertyId === 10)?.revenueMinor).toBe(
      40_000,
    )
  })

  it('excludes inaccessible properties and marks stale sync data', () => {
    const scoped = principal({ propertyIds: [10], networkWide: false })
    const summary = computeReportSummary(
      [
        reservation({ id: 1, propertyId: 10, totalAmountMinor: 10_000 }),
        reservation({ id: 2, propertyId: 99, totalAmountMinor: 50_000 }),
      ],
      scoped,
      [
        { propertyId: 10, unitCount: 1, name: 'Casa' },
        { propertyId: 99, unitCount: 1, name: 'Secret' },
      ],
      {
        status: 'failed',
        lastPullAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-16T00:00:00.000Z',
      },
      { from: '2026-07-01', to: '2026-07-05' },
      now,
    )

    expect(summary.excludedPropertyIds).toContain(99)
    expect(summary.byProperty.map((p) => p.propertyId)).toEqual([10])
    expect(summary.freshness.stale).toBe(true)
    expect(summary.freshness.staleReason).toBe('sync_failed')
  })

  it('owner-scoped summaries only include ownerPropertyIds', () => {
    const owner = principal({
      role: 'property_owner',
      propertyIds: [],
      ownerPropertyIds: [11],
      networkWide: false,
    })
    const summary = computeReportSummary(
      [
        reservation({ id: 1, propertyId: 10 }),
        reservation({ id: 2, propertyId: 11, totalAmountMinor: 8_000 }),
      ],
      owner,
      [
        { propertyId: 10, unitCount: 1, name: 'Casa' },
        { propertyId: 11, unitCount: 1, name: 'Nacar' },
      ],
      freshness,
      { from: '2026-07-01', to: '2026-07-05', ownerScoped: true },
      now,
    )
    expect(summary.byProperty.map((p) => p.propertyId)).toEqual([11])
    expect(summary.excludedPropertyIds).toContain(10)
  })
})

describe('sync staleness', () => {
  it('flags missing pull and aged pull', () => {
    expect(
      isSyncDataStale(
        { status: 'idle', lastPullAt: null, updatedAt: '2026-07-16T00:00:00Z' },
        Date.parse('2026-07-16T12:00:00Z'),
      ),
    ).toEqual({ stale: true, reason: 'no_pull_yet' })

    expect(
      isSyncDataStale(
        {
          status: 'healthy',
          lastPullAt: '2026-07-14T10:00:00.000Z',
          updatedAt: '2026-07-14T10:00:00.000Z',
        },
        Date.parse('2026-07-16T12:00:00.000Z'),
      ),
    ).toEqual({ stale: true, reason: 'pull_older_than_24h' })
  })
})
