import { describe, expect, it } from 'vitest'
import { buildPrincipal } from '@pms/auth'
import {
  computeReportSummary,
  createMemoryStore,
  isSyncDataStale,
  projectRatesReadOnly,
  runCommand,
  type RateCacheRow,
  type ReservationRecord,
} from '@pms/domain'
import { fixtureRateCache, fixtureRateCacheMiss } from '@pms/sync'
import { projectLiveRateCache } from '../../server/utils/revenue'

function principal(
  overrides: Partial<Parameters<typeof buildPrincipal>[0]> = {},
) {
  return buildPrincipal({
    userId: 'rev-web-1',
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
    paymentCollect: 'property',
    paymentType: 'credit_card',
    totalAmountMinor: 40_000,
    ...partial,
  }
}

describe('revenue web: rates read-only projection', () => {
  it('marks managed-in-Channex read-only state with freshness and cache miss', () => {
    const desk = principal({ role: 'front_desk', propertyIds: [10, 11] })
    const cache: RateCacheRow[] = [
      ...fixtureRateCache([10]),
      fixtureRateCacheMiss(11),
    ]
    const model = projectRatesReadOnly(
      desk,
      [
        { id: 10, name: 'Casa' },
        { id: 11, name: 'Nacar' },
      ],
      cache,
      {
        status: 'healthy',
        lastPullAt: '2026-07-16T08:00:00.000Z',
        updatedAt: '2026-07-16T08:00:00.000Z',
      },
      Date.parse('2026-07-16T12:00:00.000Z'),
    )

    expect(model.readOnly).toBe(true)
    expect(model.managedInChannex).toBe(true)
    expect(model.ariWriteEnabled).toBe(false)
    expect(model.freshness.stale).toBe(false)
    expect(model.plans.some((p) => p.propertyId === 10 && p.state === 'cached')).toBe(
      true,
    )
    expect(model.plans.some((p) => p.propertyId === 11 && p.state === 'cache_miss')).toBe(
      true,
    )
  })

  it('surfaces unavailable when property has no cache rows', () => {
    const model = projectRatesReadOnly(
      principal({ role: 'front_desk', propertyIds: [10] }),
      [{ id: 10, name: 'Casa' }],
      [],
      {
        status: 'idle',
        lastPullAt: null,
        updatedAt: '2026-07-16T00:00:00.000Z',
      },
      Date.parse('2026-07-16T12:00:00.000Z'),
    )
    expect(model.plans[0]?.state).toBe('unavailable')
    expect(model.freshness.stale).toBe(true)
  })
})

describe('revenue web: live ARI rate cache projection', () => {
  it('summarizes the ARI projection per plan and satisfies the read-only contract', () => {
    const store = createMemoryStore()
    store.ratePlans.push(
      {
        networkId: 1,
        propertyId: 10,
        channexId: 'plan-live',
        roomTypeChannexId: 'room-1',
        title: 'Live BAR',
        currency: 'EUR',
        parentRatePlanChannexId: null,
        channexRaw: null,
        pulledAt: '2026-08-01T08:00:00.000Z',
      },
      {
        networkId: 1,
        propertyId: 10,
        channexId: 'plan-empty',
        roomTypeChannexId: 'room-1',
        title: 'Unpulled plan',
        currency: null,
        parentRatePlanChannexId: null,
        channexRaw: null,
        pulledAt: '2026-08-01T08:00:00.000Z',
      },
    )
    store.ariRestrictions.push(
      {
        networkId: 1,
        propertyId: 10,
        ratePlanChannexId: 'plan-live',
        date: '2026-08-01',
        rateMinor: 20_000,
        minStayArrival: 2,
        minStayThrough: null,
        maxStay: null,
        closedToArrival: false,
        closedToDeparture: false,
        stopSell: false,
        snapshotVersion: 1,
        pulledAt: '2026-08-01T08:00:00.000Z',
      },
      {
        networkId: 1,
        propertyId: 10,
        ratePlanChannexId: 'plan-live',
        date: '2026-08-02',
        rateMinor: 21_550,
        minStayArrival: 3,
        minStayThrough: null,
        maxStay: null,
        closedToArrival: false,
        closedToDeparture: false,
        stopSell: true,
        snapshotVersion: 1,
        pulledAt: '2026-08-01T08:00:00.000Z',
      },
    )

    const rows = projectLiveRateCache(store, 1, [10], '2026-08-02')
    const live = rows.find((r) => r.ratePlanId === 'plan-live')
    // Representative values come from today's date within the pulled range.
    expect(live).toMatchObject({
      propertyId: 10,
      ratePlanName: 'Live BAR',
      currency: 'EUR',
      amountMinor: 21_550,
      dateFrom: '2026-08-01',
      dateTo: '2026-08-02',
      minStay: 3,
      stopSell: true,
      cachedAt: '2026-08-01T08:00:00.000Z',
    })
    // A plan with no projected dates is an explicit cache miss, not a fabrication.
    const empty = rows.find((r) => r.ratePlanId === 'plan-empty')
    expect(empty).toMatchObject({ amountMinor: null, cachedAt: null })

    // The live rows still satisfy the read-only rates contract end to end.
    const model = projectRatesReadOnly(
      principal({ role: 'front_desk', propertyIds: [10] }),
      [{ id: 10, name: 'Casa' }],
      rows,
      {
        status: 'healthy',
        lastPullAt: '2026-08-01T08:00:00.000Z',
        updatedAt: '2026-08-01T08:00:00.000Z',
      },
      Date.parse('2026-08-01T12:00:00.000Z'),
    )
    expect(model.readOnly).toBe(true)
    expect(model.plans.find((p) => p.ratePlanId === 'plan-live')?.state).toBe('cached')
    expect(model.plans.find((p) => p.ratePlanId === 'plan-empty')?.state).toBe(
      'cache_miss',
    )
  })

  it('excludes other networks and out-of-scope properties', () => {
    const store = createMemoryStore()
    store.ratePlans.push({
      networkId: 2,
      propertyId: 10,
      channexId: 'plan-foreign',
      roomTypeChannexId: null,
      title: 'Foreign',
      currency: null,
      parentRatePlanChannexId: null,
      channexRaw: null,
      pulledAt: '2026-08-01T08:00:00.000Z',
    })
    expect(projectLiveRateCache(store, 1, [10])).toEqual([])
  })
})

describe('revenue web: reports from projections', () => {
  it('calculates metrics and excludes out-of-scope properties', () => {
    const summary = computeReportSummary(
      [
        reservation({ id: 1, propertyId: 10 }),
        reservation({ id: 2, propertyId: 99, totalAmountMinor: 99_000 }),
      ],
      principal({ propertyIds: [10] }),
      [
        { propertyId: 10, unitCount: 1, name: 'Casa' },
        { propertyId: 99, unitCount: 1, name: 'Secret' },
      ],
      {
        status: 'warning',
        lastPullAt: '2026-07-16T10:00:00.000Z',
        updatedAt: '2026-07-16T10:00:00.000Z',
      },
      { from: '2026-07-01', to: '2026-07-10' },
      Date.parse('2026-07-16T12:00:00.000Z'),
    )

    expect(summary.byProperty.map((p) => p.propertyId)).toEqual([10])
    expect(summary.excludedPropertyIds).toContain(99)
    expect(summary.freshness.stale).toBe(true)
    expect(summary.freshness.staleReason).toBe('sync_warning')
    expect(summary.occupiedNights).toBe(4)
    expect(summary.adrMinor).toBe(10_000)
  })
})

describe('revenue web: payments ledger', () => {
  it('records payment/refund/invoice without mutating prior rows', async () => {
    const store = createMemoryStore()
    store.reservations.push(
      reservation({
        id: 1,
        propertyId: 10,
        paymentCollect: 'ota',
        paymentType: 'bank_transfer',
      }),
    )
    const accounting = principal({ role: 'accounting', propertyIds: [10] })

    const pay = await runCommand(
      'recordLedgerPayment',
      {
        principal: accounting,
        actorKind: 'user',
        networkId: 1,
        propertyId: 10,
      },
      {
        reservationId: 1,
        propertyId: 10,
        type: 'payment',
        amountMinor: 5000,
        currency: 'USD',
        note: 'Deposit',
      },
      { store },
    )
    expect(pay.status).toBe('ok')

    const invoice = await runCommand(
      'recordLedgerPayment',
      {
        principal: accounting,
        actorKind: 'user',
        networkId: 1,
        propertyId: 10,
      },
      {
        reservationId: 1,
        propertyId: 10,
        type: 'invoice',
        amountMinor: 5000,
        currency: 'USD',
      },
      { store },
    )
    expect(invoice.status).toBe('ok')

    const originalId = (pay.data as { id: number }).id
    const refund = await runCommand(
      'recordLedgerPayment',
      {
        principal: accounting,
        actorKind: 'user',
        networkId: 1,
        propertyId: 10,
      },
      {
        reservationId: 1,
        propertyId: 10,
        type: 'refund',
        amountMinor: 2000,
        currency: 'USD',
        compensatesEntryId: originalId,
      },
      { store },
    )
    expect(refund.status).toBe('ok')
    expect(store.ledger).toHaveLength(3)
    expect(store.ledger[0]?.note).toBe('Deposit')
    expect(store.ledger[0]?.amountMinor).toBe(5000)

    const rows = store.ledger
      .map((entry) => {
        const res = store.reservations.find((r) => r.id === entry.reservationId)
        if (!res || res.propertyId !== 10) return null
        return {
          ...entry,
          paymentCollect: res.paymentCollect,
          paymentType: res.paymentType,
        }
      })
      .filter(Boolean)

    expect(rows.every((r) => r!.paymentCollect === 'ota')).toBe(true)
    expect(rows.every((r) => r!.paymentType === 'bank_transfer')).toBe(true)
  })

  it('rejects housekeeping from payments module command', async () => {
    const store = createMemoryStore()
    store.reservations.push(reservation({ id: 1, propertyId: 10 }))
    const result = await runCommand(
      'recordLedgerPayment',
      {
        principal: principal({
          role: 'housekeeping',
          propertyIds: [10],
          userId: 'hk-1',
        }),
        actorKind: 'user',
        networkId: 1,
        propertyId: 10,
      },
      {
        reservationId: 1,
        propertyId: 10,
        type: 'payment',
        amountMinor: 100,
        currency: 'USD',
      },
      { store },
    )
    expect(result.status).toBe('rejected')
    expect(result.error?.code).toBe('MODULE_DENIED')
  })
})

describe('staleness helper smoke', () => {
  it('is exported for report freshness banners', () => {
    expect(
      isSyncDataStale({
        status: 'failed',
        lastPullAt: null,
        updatedAt: '2026-07-16T00:00:00Z',
      }),
    ).toMatchObject({ stale: true })
  })
})
