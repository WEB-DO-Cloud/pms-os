import { describe, expect, it, vi } from 'vitest'
import type { AriWriteIntentRecord } from '@pms/domain'
import { createMemorySyncStore } from '../store'
import type { ChannexClient } from '../channex/client'
import { dateHasOpenStaffIntent, detectAriDrift } from './detect-ari-drift'

function seedProperty(store: ReturnType<typeof createMemorySyncStore>) {
  const property = store.upsertProperty({
    networkId: 1,
    channexId: 'prop-cx',
    name: 'Test',
    slug: 'test',
    address: null,
    city: null,
    country: null,
    timezone: 'UTC',
    currency: 'USD',
    channexTitle: null,
    channexRaw: null,
    sourceUpdatedAt: null,
  })
  const room = store.upsertRoomType({
    networkId: 1,
    propertyId: property.id,
    channexId: 'rt-uuid',
    name: 'Studio',
    capacity: 2,
    countOfRooms: 1,
    channexRaw: null,
    sourceUpdatedAt: null,
  })
  return { property, room }
}

describe('dateHasOpenStaffIntent', () => {
  it('matches open intents covering the date/resource', () => {
    const intents: AriWriteIntentRecord[] = [
      {
        id: 1,
        networkId: 1,
        propertyId: 10,
        lane: 'availability',
        idempotencyKey: 'a',
        payload: {},
        resourceScope: {
          roomTypeChannexId: 'rt-1',
          dateFrom: '2026-08-10',
          dateTo: '2026-08-12',
        },
        baseSnapshotVersion: 1,
        status: 'accepted',
        channexTaskIds: [],
        warnings: [],
        attempts: 0,
        lastError: null,
        nextAttemptAt: null,
        actorPrincipalId: null,
        approvedByPrincipalId: null,
        compensatesIntentId: null,
        reconciledAt: null,
        createdAt: '2026-07-18T00:00:00.000Z',
        updatedAt: '2026-07-18T00:00:00.000Z',
      },
    ]
    expect(
      dateHasOpenStaffIntent(intents, {
        networkId: 1,
        propertyId: 10,
        date: '2026-08-11',
        roomTypeChannexId: 'rt-1',
        lane: 'availability',
      }),
    ).toBe(true)
    expect(
      dateHasOpenStaffIntent(intents, {
        networkId: 1,
        propertyId: 10,
        date: '2026-08-15',
        roomTypeChannexId: 'rt-1',
        lane: 'availability',
      }),
    ).toBe(false)
  })
})

describe('detectAriDrift', () => {
  it('reports availability mismatch without writing corrections', async () => {
    const store = createMemorySyncStore()
    const { property, room } = seedProperty(store)
    store.domain.ariAvailability.push({
      networkId: 1,
      propertyId: property.id,
      roomTypeId: room.id,
      date: '2026-08-10',
      availability: 2,
      snapshotVersion: 1,
      pulledAt: '2026-07-18T00:00:00.000Z',
    })

    const updateAvailability = vi.fn()
    const getAvailability = vi.fn(async () => ({
      data: { 'rt-uuid': { '2026-08-10': 0 } },
    }))
    const getRestrictions = vi.fn(async () => ({ data: {} }))
    const client = {
      getAvailability,
      getRestrictions,
      updateAvailability,
    } as unknown as ChannexClient

    const result = await detectAriDrift(store, client, 1, 'test', {
      dateFrom: '2026-08-10',
      dateTo: '2026-08-10',
    })

    expect(result.skipped).toBe(false)
    if (result.skipped) return
    expect(result.drifts).toEqual([
      {
        networkId: 1,
        propertyId: property.id,
        kind: 'availability',
        roomTypeId: room.id,
        roomTypeChannexId: 'rt-uuid',
        date: '2026-08-10',
        projected: 2,
        remote: 0,
      },
    ])
    expect(updateAvailability).not.toHaveBeenCalled()
    expect(store.domain.ariWriteIntents).toHaveLength(0)
  })

  it('skips dates covered by unresolved staff intents and does not overwrite them', async () => {
    const store = createMemorySyncStore()
    const { property, room } = seedProperty(store)
    store.domain.ariAvailability.push({
      networkId: 1,
      propertyId: property.id,
      roomTypeId: room.id,
      date: '2026-08-10',
      availability: 2,
      snapshotVersion: 1,
      pulledAt: '2026-07-18T00:00:00.000Z',
    })
    store.domain.ariWriteIntents.push({
      id: 1,
      networkId: 1,
      propertyId: property.id,
      lane: 'availability',
      idempotencyKey: 'open',
      payload: { values: [{ availability: 0 }] },
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
      actorPrincipalId: 'mgr',
      approvedByPrincipalId: null,
      compensatesIntentId: null,
      reconciledAt: null,
      createdAt: '2026-07-18T00:00:00.000Z',
      updatedAt: '2026-07-18T00:00:00.000Z',
    })

    const updateAvailability = vi.fn()
    const client = {
      getAvailability: async () => ({ data: { 'rt-uuid': { '2026-08-10': 0 } } }),
      getRestrictions: async () => ({ data: {} }),
      updateAvailability,
    } as unknown as ChannexClient

    const result = await detectAriDrift(store, client, 1, 'test', {
      dateFrom: '2026-08-10',
      dateTo: '2026-08-10',
    })

    expect(result.skipped).toBe(false)
    if (result.skipped) return
    expect(result.drifts).toHaveLength(0)
    expect(result.skippedOpenIntentDates).toBe(1)
    expect(store.domain.ariWriteIntents[0]?.status).toBe('queued')
    expect(store.domain.ariWriteIntents[0]?.payload).toEqual({
      values: [{ availability: 0 }],
    })
    expect(updateAvailability).not.toHaveBeenCalled()
  })
})
