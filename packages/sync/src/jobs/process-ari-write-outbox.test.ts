import { describe, expect, it, vi } from 'vitest'
import { createMemorySyncStore } from '../store'
import { createChannexClient, type ChannexClient } from '../channex/client'
import { processAriWriteOutbox } from './process-ari-write-outbox'
import type { AriWriteIntentRecord } from '@pms/domain'

function seedQueuedAvailability(
  store: ReturnType<typeof createMemorySyncStore>,
  overrides: Partial<AriWriteIntentRecord> = {},
): AriWriteIntentRecord {
  const now = new Date().toISOString()
  const intent: AriWriteIntentRecord = {
    id: store.domain.nextId('ari_write_intent'),
    networkId: 1,
    propertyId: 10,
    lane: 'availability',
    idempotencyKey: overrides.idempotencyKey ?? `availability:test:${Date.now()}`,
    payload: {
      values: [
        {
          property_id: null,
          room_type_id: 'rt-uuid',
          date_from: '2026-08-10',
          date_to: '2026-08-10',
          availability: 0,
        },
      ],
      _local: { propertyChannexId: 'prop-cx' },
    },
    resourceScope: {
      roomTypeChannexId: 'rt-uuid',
      dateFrom: '2026-08-10',
      dateTo: '2026-08-10',
    },
    baseSnapshotVersion: 1,
    status: 'queued',
    channexTaskIds: [],
    warnings: [],
    attempts: 0,
    lastError: null,
    nextAttemptAt: null,
    actorPrincipalId: 'mgr-1',
    approvedByPrincipalId: null,
    compensatesIntentId: null,
    reconciledAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
  store.domain.ariWriteIntents.push(intent)
  store.upsertProperty({
    networkId: 1,
    channexId: 'prop-cx',
    name: 'Test',
    slug: 'test',
    timezone: 'UTC',
    currency: 'USD',
    channexRaw: null,
  })
  return intent
}

function mockClient(handlers: {
  updateAvailability?: ChannexClient['updateAvailability']
  getAvailability?: ChannexClient['getAvailability']
}): ChannexClient {
  return {
    updateAvailability:
      handlers.updateAvailability ??
      (async () => ({ data: [], meta: { message: 'Success' } })),
    getAvailability:
      handlers.getAvailability ??
      (async () => ({ data: { 'rt-uuid': { '2026-08-10': 0 } } })),
  } as ChannexClient
}

describe('processAriWriteOutbox availability lane (U6)', () => {
  it('AE4: HTTP 200 with warnings → partial, not full success', async () => {
    const store = createMemorySyncStore()
    const intent = seedQueuedAvailability(store)
    const updateAvailability = vi.fn(async () => ({
      data: [],
      meta: {
        message: 'Success',
        warnings: [
          {
            room_type_id: 'rt-uuid',
            date_from: '2026-08-10',
            warning: { availability: ['invalid'] },
          },
        ],
      },
    }))
    const client = mockClient({ updateAvailability })

    const result = await processAriWriteOutbox(store, client, 1)
    expect(result.processed).toBeGreaterThanOrEqual(1)
    expect(intent.status).toBe('partial')
    expect(intent.warnings).toHaveLength(1)
    expect(updateAvailability).toHaveBeenCalledTimes(1)
  })

  it('AE6: restart after accepted resumes reconcile without duplicate POST', async () => {
    const store = createMemorySyncStore()
    const intent = seedQueuedAvailability(store, {
      status: 'accepted',
      attempts: 1,
      channexTaskIds: ['task-1'],
    })
    const updateAvailability = vi.fn(async () => {
      throw new Error('should not POST again')
    })
    const getAvailability = vi.fn(async () => ({
      data: { 'rt-uuid': { '2026-08-10': 0 } },
    }))
    const client = mockClient({ updateAvailability, getAvailability })

    await processAriWriteOutbox(store, client, 1)
    expect(updateAvailability).not.toHaveBeenCalled()
    expect(getAvailability).toHaveBeenCalled()
    expect(intent.status).toBe('reconciled')
    expect(intent.reconciledAt).toBeTruthy()
  })

  it('reconciles when GET matches desired absolute availability', async () => {
    const store = createMemorySyncStore()
    const intent = seedQueuedAvailability(store)
    const client = mockClient({
      updateAvailability: async () => ({
        data: [{ id: 'task-9' }],
        meta: { message: 'Success' },
      }),
      getAvailability: async () => ({
        data: { 'rt-uuid': { '2026-08-10': 0 } },
      }),
    })

    await processAriWriteOutbox(store, client, 1)
    expect(intent.status).toBe('reconciled')
    expect(intent.channexTaskIds).toContain('task-9')
  })

  it('marks drifted when GET does not match desired value', async () => {
    const store = createMemorySyncStore()
    const intent = seedQueuedAvailability(store)
    const client = mockClient({
      updateAvailability: async () => ({ data: [], meta: { message: 'Success' } }),
      getAvailability: async () => ({
        data: { 'rt-uuid': { '2026-08-10': 2 } },
      }),
    })

    await processAriWriteOutbox(store, client, 1)
    expect(intent.status).toBe('drifted')
  })

  it('skips cancelled and prefers latest queued for same resource', async () => {
    const store = createMemorySyncStore()
    const older = seedQueuedAvailability(store, {
      idempotencyKey: 'older',
      status: 'cancelled',
    })
    const newer = seedQueuedAvailability(store, {
      idempotencyKey: 'newer',
      payload: {
        values: [
          {
            property_id: null,
            room_type_id: 'rt-uuid',
            date_from: '2026-08-10',
            date_to: '2026-08-10',
            availability: 1,
          },
        ],
        _local: { propertyChannexId: 'prop-cx' },
      },
    })
    const updateAvailability = vi.fn(async (values: { availability: number }[]) => {
      expect(values[0]?.availability).toBe(1)
      return { data: [], meta: { message: 'Success' } }
    })
    const client = mockClient({
      updateAvailability,
      getAvailability: async () => ({
        data: { 'rt-uuid': { '2026-08-10': 1 } },
      }),
    })

    await processAriWriteOutbox(store, client, 1)
    expect(updateAvailability).toHaveBeenCalledTimes(1)
    expect(older.status).toBe('cancelled')
    expect(newer.status).toBe('reconciled')
  })
})

describe('processAriWriteOutbox restrictions lane (U7)', () => {
  function seedQueuedRestrictions(
    store: ReturnType<typeof createMemorySyncStore>,
    overrides: Partial<AriWriteIntentRecord> = {},
  ): AriWriteIntentRecord {
    const now = new Date().toISOString()
    const intent: AriWriteIntentRecord = {
      id: store.domain.nextId('ari_write_intent'),
      networkId: 1,
      propertyId: 10,
      lane: 'restrictions',
      idempotencyKey: overrides.idempotencyKey ?? `restrictions:test:${Date.now()}`,
      payload: {
        values: [
          {
            property_id: null,
            rate_plan_id: 'rp-uuid',
            date_from: '2026-08-10',
            date_to: '2026-08-10',
            rate: 25_000,
            min_stay_arrival: 2,
          },
        ],
        _local: {
          propertyChannexId: 'prop-cx',
          fields: { rateMinor: 25_000, minStayArrival: 2 },
        },
      },
      resourceScope: {
        ratePlanChannexId: 'rp-uuid',
        dateFrom: '2026-08-10',
        dateTo: '2026-08-10',
      },
      baseSnapshotVersion: 1,
      status: 'queued',
      channexTaskIds: [],
      warnings: [],
      attempts: 0,
      lastError: null,
      nextAttemptAt: null,
      actorPrincipalId: 'mgr-1',
      approvedByPrincipalId: null,
      compensatesIntentId: null,
      reconciledAt: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    }
    store.domain.ariWriteIntents.push(intent)
    store.upsertProperty({
      networkId: 1,
      channexId: 'prop-cx',
      name: 'Test',
      slug: 'test',
      timezone: 'UTC',
      currency: 'USD',
      channexRaw: null,
    })
    return intent
  }

  it('AE4: restrictions HTTP 200 with warnings → partial', async () => {
    const store = createMemorySyncStore()
    const intent = seedQueuedRestrictions(store)
    const updateRestrictions = vi.fn(async () => ({
      data: [],
      meta: {
        message: 'Success',
        warnings: [{ rate_plan_id: 'rp-uuid', warning: { rate: ['invalid'] } }],
      },
    }))
    const client = {
      updateRestrictions,
      getRestrictions: async () => ({ data: {} }),
    } as unknown as ChannexClient

    await processAriWriteOutbox(store, client, 1)
    expect(intent.status).toBe('partial')
    expect(updateRestrictions).toHaveBeenCalledTimes(1)
  })

  it('AE6: restart after accepted resumes restrictions reconcile without POST', async () => {
    const store = createMemorySyncStore()
    const intent = seedQueuedRestrictions(store, {
      status: 'accepted',
      attempts: 1,
    })
    const updateRestrictions = vi.fn(async () => {
      throw new Error('should not POST')
    })
    const getRestrictions = vi.fn(async () => ({
      data: {
        'rp-uuid': {
          '2026-08-10': { rate: '250.00', min_stay_arrival: 2 },
        },
      },
    }))
    const client = {
      updateRestrictions,
      getRestrictions,
    } as unknown as ChannexClient

    await processAriWriteOutbox(store, client, 1)
    expect(updateRestrictions).not.toHaveBeenCalled()
    expect(getRestrictions).toHaveBeenCalled()
    expect(intent.status).toBe('reconciled')
  })
})

describe('Channex updateRestrictions / updateRatePlan client', () => {
  it('POSTs /restrictions with integer minor-unit rate', async () => {
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ data: [], meta: { message: 'Success' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const client = createChannexClient({
      apiKey: 'test-key',
      baseUrl: 'https://example.test/api/v1',
      fetchFn: fetchFn as typeof fetch,
    })
    await client.updateRestrictions([
      {
        property_id: 'prop-1',
        rate_plan_id: 'rp-1',
        date_from: '2026-08-10',
        date_to: '2026-08-12',
        rate: 30000,
        stop_sell: true,
      },
    ])
    expect(fetchFn).toHaveBeenCalledWith(
      'https://example.test/api/v1/restrictions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          values: [
            {
              property_id: 'prop-1',
              rate_plan_id: 'rp-1',
              date_from: '2026-08-10',
              date_to: '2026-08-12',
              rate: 30000,
              stop_sell: true,
            },
          ],
        }),
      }),
    )
  })

  it('PUTs /rate_plans/:id with derived_option shape', async () => {
    const fetchFn = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: {
            id: 'rp-1',
            type: 'rate_plan',
            attributes: { title: 'Derived', rate_mode: 'derived' },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    const client = createChannexClient({
      apiKey: 'test-key',
      baseUrl: 'https://example.test/api/v1',
      fetchFn: fetchFn as typeof fetch,
    })
    await client.updateRatePlan('rp-1', {
      options: [
        {
          occupancy: 2,
          is_primary: true,
          derived_option: { rate: [['increase_by_percent', '15']] },
        },
      ],
    })
    expect(fetchFn).toHaveBeenCalledWith(
      'https://example.test/api/v1/rate_plans/rp-1',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          rate_plan: {
            options: [
              {
                occupancy: 2,
                is_primary: true,
                derived_option: { rate: [['increase_by_percent', '15']] },
              },
            ],
          },
        }),
      }),
    )
  })
})
