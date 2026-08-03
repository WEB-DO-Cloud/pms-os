import { describe, expect, it } from 'vitest'
import type { ChannexClient } from '../channex/client'
import { createMemorySyncStore } from '../store'
import { runAriPull } from './pull-ari'

const OUR_PROPERTY = '71d34923-a8be-4682-9625-e4a2f080df92'
const ROOM_A = 'room-aaaa'
const ROOM_B = 'room-bbbb'
const PLAN_A = 'plan-aaaa'
const PLAN_B = 'plan-bbbb'

function seededStore() {
  const store = createMemorySyncStore()
  store.upsertProperty({
    networkId: 1,
    channexId: OUR_PROPERTY,
    name: 'Villa Test',
    slug: 'villa-test',
    address: null,
    city: null,
    country: null,
    timezone: null,
    currency: 'USD',
    channexTitle: null,
    channexRaw: null,
    sourceUpdatedAt: null,
  })
  const propertyId = store.listProperties(1)[0]!.id
  for (const [channexId, name] of [
    [ROOM_A, 'Double'],
    [ROOM_B, 'Suite'],
  ] as const) {
    store.upsertRoomType({
      networkId: 1,
      propertyId,
      channexId,
      name,
      capacity: 2,
      countOfRooms: 2,
      channexRaw: null,
      sourceUpdatedAt: null,
    })
  }
  return { store, propertyId }
}

function fakeClient(overrides: Partial<ChannexClient> = {}): ChannexClient {
  return {
    listRatePlans: async () => ({
      data: [
        {
          id: PLAN_A,
          type: 'rate_plan',
          attributes: {
            title: 'Standard BAR',
            property_id: OUR_PROPERTY,
            room_type_id: ROOM_A,
            currency: 'USD',
            rate_mode: 'manual',
            parent_rate_plan_id: null,
          },
        },
        {
          id: PLAN_B,
          type: 'rate_plan',
          attributes: {
            title: 'Airbnb derived',
            property_id: OUR_PROPERTY,
            room_type_id: ROOM_A,
            currency: 'USD',
            rate_mode: 'derived',
            parent_rate_plan_id: PLAN_A,
          },
        },
      ],
    }),
    getAvailability: async () => ({
      data: {
        [ROOM_A]: { '2026-08-01': 2, '2026-08-02': 1 },
        [ROOM_B]: { '2026-08-01': 1, '2026-08-02': 1 },
        // Cross-tenant room type visible to a master key must not leak in.
        'room-other-tenant': { '2026-08-01': 5 },
      },
    }),
    getRestrictions: async () => ({
      data: {
        [PLAN_A]: {
          '2026-08-01': {
            rate: '200.00',
            min_stay_arrival: 2,
            stop_sell: false,
            closed_to_arrival: false,
            closed_to_departure: false,
            max_stay: 0,
          },
          '2026-08-02': { rate: '215.50', min_stay_arrival: 2, stop_sell: true },
        },
        [PLAN_B]: {
          '2026-08-01': { rate: '220.00', min_stay_arrival: 2 },
        },
        'plan-other-tenant': {
          '2026-08-01': { rate: '999.00' },
        },
      },
    }),
    ...overrides,
  } as ChannexClient
}

describe('runAriPull', () => {
  it('normalizes availability, rates, and restrictions with one snapshot version', async () => {
    const { store, propertyId } = seededStore()
    const result = await runAriPull(store, fakeClient(), 1, 'test', {
      dateFrom: '2026-08-01',
      dateTo: '2026-08-02',
    })
    expect(result.skipped).toBe(false)
    if (result.skipped) return

    expect(result.snapshotVersion).toBe(1)
    expect(store.domain.ariAvailability).toHaveLength(4)
    const roomA = store.listRoomTypes(1).find((r) => r.channexId === ROOM_A)!
    expect(
      store.domain.ariAvailability.find(
        (a) => a.roomTypeId === roomA.id && a.date === '2026-08-02',
      ),
    ).toMatchObject({ networkId: 1, propertyId, availability: 1, snapshotVersion: 1 })

    // Rate is a decimal string from Channex; stored in minor units.
    const restA = store.domain.ariRestrictions.find(
      (r) => r.ratePlanChannexId === PLAN_A && r.date === '2026-08-02',
    )
    expect(restA).toMatchObject({
      rateMinor: 21_550,
      stopSell: true,
      minStayArrival: 2,
      snapshotVersion: 1,
    })

    // Rate plan catalog including derived parent linkage.
    const derived = store.domain.ratePlans.find((p) => p.channexId === PLAN_B)
    expect(derived).toMatchObject({
      parentRatePlanChannexId: PLAN_A,
      roomTypeChannexId: ROOM_A,
      currency: 'USD',
    })

    // Cross-tenant data from a master key never lands in the projection.
    expect(
      store.domain.ariRestrictions.some(
        (r) => r.ratePlanChannexId === 'plan-other-tenant',
      ),
    ).toBe(false)
  })

  it('re-pulling unchanged values does not bump the snapshot version', async () => {
    const { store } = seededStore()
    const opts = { dateFrom: '2026-08-01', dateTo: '2026-08-02' }
    await runAriPull(store, fakeClient(), 1, 'test', opts)
    const again = await runAriPull(store, fakeClient(), 1, 'test', opts)
    expect(again).toMatchObject({ skipped: false, snapshotVersion: 1, changed: 0 })
  })

  it('bumps the snapshot version when a value changes', async () => {
    const { store } = seededStore()
    const opts = { dateFrom: '2026-08-01', dateTo: '2026-08-02' }
    await runAriPull(store, fakeClient(), 1, 'test', opts)
    const changedClient = fakeClient({
      getAvailability: async () => ({
        data: { [ROOM_A]: { '2026-08-01': 0, '2026-08-02': 1 }, [ROOM_B]: { '2026-08-01': 1, '2026-08-02': 1 } },
      }),
    } as Partial<ChannexClient>)
    const result = await runAriPull(store, changedClient, 1, 'test', opts)
    expect(result).toMatchObject({ skipped: false, snapshotVersion: 2 })
    const roomA = store.listRoomTypes(1).find((r) => r.channexId === ROOM_A)!
    expect(
      store.domain.ariAvailability.find(
        (a) => a.roomTypeId === roomA.id && a.date === '2026-08-01',
      ),
    ).toMatchObject({ availability: 0, snapshotVersion: 2 })
    // Unchanged rows keep their original version — no false drift.
    expect(
      store.domain.ariAvailability.find(
        (a) => a.roomTypeId === roomA.id && a.date === '2026-08-02',
      ),
    ).toMatchObject({ snapshotVersion: 1 })
  })

  it('skips when another holder owns the lease', async () => {
    const { store } = seededStore()
    store.tryAcquireLease(1, 'pull_ari', 'someone-else', 60_000)
    const result = await runAriPull(store, fakeClient(), 1, 'test')
    expect(result).toEqual({ skipped: true, reason: 'lease' })
    expect(store.domain.ariAvailability).toHaveLength(0)
  })

  it('records degraded properties when rate plans are missing', async () => {
    const { store, propertyId } = seededStore()
    const client = fakeClient({
      listRatePlans: async () => ({ data: [] }),
    } as Partial<ChannexClient>)
    const result = await runAriPull(store, client, 1, 'test', {
      dateFrom: '2026-08-01',
      dateTo: '2026-08-02',
    })
    expect(result.skipped).toBe(false)
    if (result.skipped) return
    expect(result.degraded).toEqual([
      { propertyId, reason: 'no_rate_plans' },
    ])
    // Availability still lands; only the rate/restriction lane is degraded.
    expect(store.domain.ariAvailability.length).toBeGreaterThan(0)
    expect(store.domain.ariRestrictions).toHaveLength(0)
  })
})
