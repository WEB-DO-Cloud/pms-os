import { describe, expect, it } from 'vitest'
import { buildPrincipal } from '@pms/auth'
import {
  assertCapability,
  assertFreshSnapshot,
  assertValidDateRange,
  cancelQueuedIntent,
  createMemoryStore,
  currentSnapshotVersion,
  enqueueAriIntent,
  getNetworkCapabilities,
  propertyLocalToday,
  runCommand,
  type CommandContext,
} from './index'

function principal(role: 'org_admin' | 'manager' | 'front_desk') {
  return buildPrincipal({
    userId: `u-${role}`,
    networkId: 1,
    role,
    propertyIds: [10],
    networkWide: role !== 'front_desk',
  })!
}

function ctx(p: ReturnType<typeof principal>): CommandContext {
  return { principal: p, actorKind: 'user', networkId: 1 }
}

describe('capability gates (KTD7)', () => {
  it('every write class defaults off', () => {
    const store = createMemoryStore()
    const caps = getNetworkCapabilities(store, 1)
    expect(caps.bookingCrsWrite).toBe(false)
    expect(caps.availabilityWrite).toBe(false)
    expect(caps.rateRestrictionWrite).toBe(false)
    expect(caps.derivedRateWrite).toBe(false)
    expect(caps.aiApply).toBe(false)
  })

  it('assertCapability fails closed with CAPABILITY_OFF', () => {
    const store = createMemoryStore()
    expect(() => assertCapability(store, 1, 'availabilityWrite')).toThrowError(
      expect.objectContaining({ code: 'CAPABILITY_OFF' }),
    )
  })

  it('only capability_admin (org_admin) can toggle gates', async () => {
    const store = createMemoryStore()
    const denied = await runCommand(
      'setNetworkCapability',
      ctx(principal('manager')),
      { capability: 'availabilityWrite', enabled: true },
      { store },
    )
    expect(denied.status).toBe('rejected')
    expect(denied.error?.code).toBe('ACTION_DENIED')
    expect(store.networkCapabilities).toHaveLength(0)

    const ok = await runCommand(
      'setNetworkCapability',
      ctx(principal('org_admin')),
      { capability: 'availabilityWrite', enabled: true },
      { store },
    )
    expect(ok.status).toBe('ok')
    expect(getNetworkCapabilities(store, 1).availabilityWrite).toBe(true)
    expect(() => assertCapability(store, 1, 'availabilityWrite')).not.toThrow()
    // Other classes remain independently off.
    expect(() => assertCapability(store, 1, 'rateRestrictionWrite')).toThrow()
  })
})

describe('write intent outbox (KTD3)', () => {
  const input = {
    networkId: 1,
    propertyId: 10,
    lane: 'availability' as const,
    idempotencyKey: 'close-rt1-2026-08-01',
    payload: { values: [{ availability: 0 }] },
    resourceScope: {
      roomTypeChannexId: 'rt-uuid',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-03',
    },
    baseSnapshotVersion: 3,
    actorPrincipalId: 'u-manager',
  }

  it('reusing an idempotency key returns the original row and creates one intent', () => {
    const store = createMemoryStore()
    const first = enqueueAriIntent(store, input)
    const replay = enqueueAriIntent(store, { ...input, payload: { different: true } })
    expect(replay.id).toBe(first.id)
    expect(replay.payload).toEqual(input.payload)
    expect(store.ariWriteIntents).toHaveLength(1)
    expect(first.status).toBe('queued')
  })

  it('cancel is only valid before send', () => {
    const store = createMemoryStore()
    const intent = enqueueAriIntent(store, input)
    expect(cancelQueuedIntent(store, 1, intent.id).status).toBe('cancelled')

    const second = enqueueAriIntent(store, { ...input, idempotencyKey: 'k2' })
    second.status = 'accepted'
    expect(() => cancelQueuedIntent(store, 1, second.id)).toThrowError(
      expect.objectContaining({ code: 'CONFLICT' }),
    )
  })

  it('restart hydration preserves lifecycle states verbatim', () => {
    const store = createMemoryStore()
    for (const [i, status] of (
      ['queued', 'retry', 'accepted', 'partial', 'drifted'] as const
    ).entries()) {
      const intent = enqueueAriIntent(store, { ...input, idempotencyKey: `k-${i}` })
      intent.status = status
    }
    // Simulate rehydration into a fresh store (what PG boot hydration does).
    const rebooted = createMemoryStore()
    rebooted.ariWriteIntents.push(
      ...store.ariWriteIntents.map((r) => ({ ...r })),
    )
    expect(rebooted.ariWriteIntents.map((i) => i.status)).toEqual([
      'queued',
      'retry',
      'accepted',
      'partial',
      'drifted',
    ])
  })
})

describe('snapshot staleness (KTD6)', () => {
  it('rejects a base version older than the reconciled projection', () => {
    const store = createMemoryStore()
    store.ariAvailability.push({
      networkId: 1,
      propertyId: 10,
      roomTypeId: 5,
      date: '2026-08-01',
      availability: 2,
      snapshotVersion: 4,
      pulledAt: new Date().toISOString(),
    })
    expect(currentSnapshotVersion(store, 1)).toBe(4)
    expect(() => assertFreshSnapshot(store, 1, 3)).toThrowError(
      expect.objectContaining({ code: 'STALE_SNAPSHOT' }),
    )
    expect(() => assertFreshSnapshot(store, 1, 4)).not.toThrow()
  })
})

describe('property-local date validation (KTD12)', () => {
  it('rejects past dates, inverted ranges, and beyond-horizon dates', () => {
    const today = '2026-07-18'
    expect(() => assertValidDateRange('2026-07-17', '2026-07-19', today)).toThrow()
    expect(() => assertValidDateRange('2026-07-20', '2026-07-19', today)).toThrow()
    expect(() => assertValidDateRange('2026-07-18', '2029-01-01', today)).toThrow()
    expect(() => assertValidDateRange('2026-07-18', '2026-07-19', today)).not.toThrow()
    expect(() => assertValidDateRange('bad', '2026-07-19', today)).toThrow()
  })

  it('formats today in the property timezone', () => {
    expect(propertyLocalToday('UTC')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // Kiribati is UTC+14 — its local date is ahead of or equal to UTC's.
    expect(propertyLocalToday('Pacific/Kiritimati') >= propertyLocalToday('UTC')).toBe(true)
  })
})
