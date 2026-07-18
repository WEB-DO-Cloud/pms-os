import { describe, expect, it } from 'vitest'
import {
  ACCEPTED_ALERT_AGE_MS,
  aggregateAriWriteHealth,
  toPublicSyncHealth,
} from './sync-health'
import type { SyncHealthRow } from './store'
import type { AriWriteIntentRecord } from '@pms/domain'
import { createMemoryStore } from '@pms/domain'

const row: SyncHealthRow = {
  networkId: 1,
  status: 'failed',
  lastPullAt: '2026-07-16T12:00:00.000Z',
  lastWebhookAt: null,
  lastAckAt: null,
  lastErrorCode: 'UNMAPPED_PROPERTY',
  lastErrorMessage: 'Guest Jane Doe phone +18095550123 payload {...}',
  updatedAt: '2026-07-16T12:01:00.000Z',
}

function intent(
  partial: Partial<AriWriteIntentRecord> & Pick<AriWriteIntentRecord, 'id' | 'status' | 'lane'>,
): AriWriteIntentRecord {
  const now = '2026-07-18T10:00:00.000Z'
  return {
    networkId: 1,
    propertyId: 10,
    idempotencyKey: `k-${partial.id}`,
    payload: {
      values: [{ availability: 0 }],
      guestName: 'SECRET_GUEST',
      apiKey: 'chx_secret_key',
    },
    resourceScope: {
      roomTypeChannexId: 'rt-1',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-01',
    },
    baseSnapshotVersion: 1,
    channexTaskIds: ['task-1'],
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
    ...partial,
  }
}

describe('toPublicSyncHealth', () => {
  it('exposes status metadata without error detail or raw payloads by default', () => {
    const pub = toPublicSyncHealth(row, { deadLetterCount: 2, pendingAckCount: 3 })
    expect(pub).toEqual({
      networkId: 1,
      status: 'failed',
      lastPullAt: '2026-07-16T12:00:00.000Z',
      lastWebhookAt: null,
      lastAckAt: null,
      lastErrorCode: 'UNMAPPED_PROPERTY',
      updatedAt: '2026-07-16T12:01:00.000Z',
      deadLetterCount: 2,
      pendingAckCount: 3,
    })
    expect(pub).not.toHaveProperty('lastErrorMessage')
    expect(JSON.stringify(pub)).not.toContain('Jane Doe')
    expect(JSON.stringify(pub)).not.toContain('+18095550123')
  })

  it('includes lastErrorMessage only when explicitly requested', () => {
    const pub = toPublicSyncHealth(row, { includeErrorDetail: true })
    expect(pub.lastErrorMessage).toContain('Jane Doe')
  })
})

describe('aggregateAriWriteHealth', () => {
  it('reports lag/warning/drift counts without guest data, API keys, or payload secrets', () => {
    const domain = createMemoryStore()
    domain.ariWriteIntents.push(
      intent({
        id: 1,
        status: 'accepted',
        lane: 'availability',
        updatedAt: '2026-07-18T09:00:00.000Z',
        warnings: [{ warning: 'soft' }],
      }),
      intent({
        id: 2,
        status: 'drifted',
        lane: 'restrictions',
        propertyId: 11,
        resourceScope: {
          ratePlanChannexId: 'rp-9',
          dateFrom: '2026-08-02',
          dateTo: '2026-08-03',
        },
      }),
      intent({
        id: 3,
        status: 'retry',
        lane: 'availability',
        lastError: 'channex_429',
      }),
      intent({
        id: 4,
        status: 'queued',
        lane: 'booking_crs',
        createdAt: '2026-07-18T08:00:00.000Z',
        payload: { guest: { name: 'PII Person', email: 'x@y.z' } },
      }),
      intent({
        id: 5,
        status: 'reconciled',
        lane: 'availability',
      }),
    )

    const metrics = aggregateAriWriteHealth(domain, 1, {
      nowMs: Date.parse('2026-07-18T10:00:00.000Z'),
    })
    const json = JSON.stringify(metrics)

    expect(metrics.pendingOutboxCount).toBe(3) // accepted + retry + queued
    expect(metrics.acceptedUnreconciledCount).toBe(1)
    expect(metrics.partialCount).toBe(0)
    expect(metrics.driftedCount).toBe(1)
    expect(metrics.retryCount).toBe(1)
    expect(metrics.warningIntentCount).toBe(1)
    expect(metrics.pendingOutboxByLane.availability).toBe(2)
    expect(metrics.pendingOutboxByLane.booking_crs).toBe(1)
    expect(metrics.oldestQueuedAt).toBe('2026-07-18T08:00:00.000Z')
    expect(metrics.oldestPendingBookingRevisionAt).toBe('2026-07-18T08:00:00.000Z')
    expect(metrics.properties).toHaveLength(2)

    expect(json).not.toContain('SECRET_GUEST')
    expect(json).not.toContain('chx_secret_key')
    expect(json).not.toContain('PII Person')
    expect(json).not.toContain('x@y.z')
    expect(json).not.toContain('values')

    const pub = toPublicSyncHealth(row, { ariWrite: metrics })
    expect(JSON.stringify(pub)).not.toContain('Jane Doe')
    expect(pub.ariWrite?.stuckAcceptedAlerts[0]?.roomTypeChannexId).toBe('rt-1')
  })

  it('alerts when stuck accepted age crosses threshold with network/property/resource scope', () => {
    const domain = createMemoryStore()
    const acceptedAt = '2026-07-18T09:00:00.000Z'
    domain.ariWriteIntents.push(
      intent({
        id: 7,
        status: 'accepted',
        lane: 'availability',
        propertyId: 42,
        updatedAt: acceptedAt,
        resourceScope: {
          roomTypeChannexId: 'rt-stuck',
          dateFrom: '2026-09-01',
          dateTo: '2026-09-02',
        },
      }),
    )

    const nowMs = Date.parse(acceptedAt) + ACCEPTED_ALERT_AGE_MS + 1
    const metrics = aggregateAriWriteHealth(domain, 1, { nowMs })
    expect(metrics.stuckAcceptedAlerts).toHaveLength(1)
    expect(metrics.stuckAcceptedAlerts[0]).toMatchObject({
      networkId: 1,
      propertyId: 42,
      intentId: 7,
      lane: 'availability',
      roomTypeChannexId: 'rt-stuck',
      dateFrom: '2026-09-01',
      dateTo: '2026-09-02',
    })
    expect(metrics.stuckAcceptedAlerts[0]!.ageMs).toBeGreaterThanOrEqual(ACCEPTED_ALERT_AGE_MS)
    expect(metrics.properties[0]?.stuckAccepted).toHaveLength(1)
  })

  it('keeps open intents visible after a write-class kill switch (capability gate is enqueue-only)', () => {
    // Disabling availabilityWrite stops new commands; existing outbox rows still count.
    const domain = createMemoryStore()
    domain.networkCapabilities.push({
      networkId: 1,
      bookingCrsWrite: false,
      availabilityWrite: false,
      rateRestrictionWrite: false,
      derivedRateWrite: false,
      aiApply: false,
      updatedAt: new Date().toISOString(),
    })
    domain.ariWriteIntents.push(
      intent({ id: 9, status: 'accepted', lane: 'availability' }),
      intent({ id: 10, status: 'retry', lane: 'availability' }),
    )
    const metrics = aggregateAriWriteHealth(domain, 1)
    expect(metrics.pendingOutboxCount).toBe(2)
    expect(metrics.acceptedUnreconciledCount).toBe(1)
    expect(metrics.retryCount).toBe(1)
  })
})
