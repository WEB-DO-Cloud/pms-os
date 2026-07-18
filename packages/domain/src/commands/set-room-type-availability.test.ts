import { describe, expect, it } from 'vitest'
import { buildPrincipal } from '@pms/auth'
import {
  createMemoryStore,
  runCommand,
  type CommandContext,
  type DomainStore,
} from '../index'

function principal(
  overrides: Partial<Parameters<typeof buildPrincipal>[0]> = {},
) {
  return buildPrincipal({
    userId: 'mgr-1',
    networkId: 1,
    role: 'manager',
    propertyIds: [10, 20],
    networkWide: false,
    ...overrides,
  })!
}

function ctx(
  p: NonNullable<ReturnType<typeof buildPrincipal>>,
  partial: Partial<CommandContext> = {},
): CommandContext {
  return {
    principal: p,
    actorKind: 'user',
    networkId: p.networkId!,
    propertyId: 10,
    ...partial,
  }
}

function enableAvailabilityWrite(store: DomainStore) {
  store.networkCapabilities.push({
    networkId: 1,
    bookingCrsWrite: false,
    availabilityWrite: true,
    rateRestrictionWrite: false,
    derivedRateWrite: false,
    aiApply: false,
    updatedAt: new Date().toISOString(),
  })
}

function seedSnapshot(store: DomainStore, version: number) {
  store.ariAvailability.push({
    networkId: 1,
    propertyId: 10,
    roomTypeId: 5,
    date: '2026-08-10',
    availability: 2,
    snapshotVersion: version,
    pulledAt: new Date().toISOString(),
  })
}

const baseInput = {
  propertyId: 10,
  roomTypeId: 5,
  roomTypeChannexId: 'rt-uuid',
  dateFrom: '2026-08-10',
  dateTo: '2026-08-12',
  availability: 0,
  baseSnapshotVersion: 1,
  propertyTimezone: 'UTC',
}

describe('setRoomTypeAvailability (U6)', () => {
  it('capability off rejects before enqueue', async () => {
    const store = createMemoryStore()
    seedSnapshot(store, 1)
    const created = await runCommand(
      'setRoomTypeAvailability',
      ctx(principal()),
      baseInput,
      { store },
    )
    expect(created.status).toBe('rejected')
    expect(created.error?.code).toBe('CAPABILITY_OFF')
    expect(store.ariWriteIntents).toHaveLength(0)
  })

  it('front desk fails with ACTION_DENIED before enqueue (no ari_write)', async () => {
    const store = createMemoryStore()
    enableAvailabilityWrite(store)
    seedSnapshot(store, 1)
    const created = await runCommand(
      'setRoomTypeAvailability',
      ctx(principal({ role: 'front_desk', userId: 'fd-1' })),
      baseInput,
      { store },
    )
    expect(created.status).toBe('rejected')
    expect(created.error?.code).toBe('ACTION_DENIED')
    expect(store.ariWriteIntents).toHaveLength(0)
  })

  it('manager closes range → one absolute intent, queued', async () => {
    const store = createMemoryStore()
    enableAvailabilityWrite(store)
    seedSnapshot(store, 1)
    const created = await runCommand(
      'setRoomTypeAvailability',
      ctx(principal()),
      baseInput,
      { store },
    )
    expect(created.status).toBe('ok')
    expect(store.ariWriteIntents).toHaveLength(1)
    const intent = store.ariWriteIntents[0]!
    expect(intent).toMatchObject({
      lane: 'availability',
      status: 'queued',
      propertyId: 10,
    })
    const payload = intent.payload as {
      values: Array<{ availability: number; room_type_id: string }>
    }
    expect(payload.values).toHaveLength(1)
    expect(payload.values[0]?.availability).toBe(0)
    expect(payload.values[0]?.room_type_id).toBe('rt-uuid')
    expect(intent.resourceScope).toMatchObject({
      roomTypeChannexId: 'rt-uuid',
      dateFrom: '2026-08-10',
      dateTo: '2026-08-12',
    })
  })

  it('AE5: stale snapshot rejects before enqueue', async () => {
    const store = createMemoryStore()
    enableAvailabilityWrite(store)
    seedSnapshot(store, 2)
    const created = await runCommand(
      'setRoomTypeAvailability',
      ctx(principal()),
      { ...baseInput, baseSnapshotVersion: 1 },
      { store },
    )
    expect(created.status).toBe('rejected')
    expect(created.error?.code).toBe('STALE_SNAPSHOT')
    expect(store.ariWriteIntents).toHaveLength(0)
  })

  it('coalesces two queued changes for same resource/date; accepted not overwritten', async () => {
    const store = createMemoryStore()
    enableAvailabilityWrite(store)
    seedSnapshot(store, 1)

    const first = await runCommand(
      'setRoomTypeAvailability',
      ctx(principal()),
      { ...baseInput, availability: 0 },
      { store },
    )
    expect(first.status).toBe('ok')
    const firstId = first.data!.intent.id

    const second = await runCommand(
      'setRoomTypeAvailability',
      ctx(principal()),
      { ...baseInput, availability: 1, baseSnapshotVersion: 1 },
      { store },
    )
    expect(second.status).toBe('ok')
    expect(store.ariWriteIntents.find((i) => i.id === firstId)?.status).toBe(
      'cancelled',
    )
    expect(second.data!.intent.status).toBe('queued')
    expect(
      (second.data!.intent.payload as { values: { availability: number }[] })
        .values[0]?.availability,
    ).toBe(1)

    // Already-accepted sibling must not be cancelled (AE6 safety).
    store.ariWriteIntents.push({
      ...second.data!.intent,
      id: store.nextId('ari_write_intent'),
      idempotencyKey: 'accepted-sibling',
      status: 'accepted',
      payload: {
        values: [
          {
            property_id: null,
            room_type_id: 'rt-uuid',
            date_from: '2026-08-10',
            date_to: '2026-08-12',
            availability: 0,
          },
        ],
      },
    })
    const third = await runCommand(
      'setRoomTypeAvailability',
      ctx(principal()),
      { ...baseInput, availability: 3 },
      { store },
    )
    expect(third.status).toBe('ok')
    const accepted = store.ariWriteIntents.find(
      (i) => i.idempotencyKey === 'accepted-sibling',
    )
    expect(accepted?.status).toBe('accepted')
  })

  it('compensating reopen is a new audited intent with explicit prior absolute value', async () => {
    const store = createMemoryStore()
    enableAvailabilityWrite(store)
    seedSnapshot(store, 1)

    const close = await runCommand(
      'setRoomTypeAvailability',
      ctx(principal()),
      { ...baseInput, availability: 0 },
      { store },
    )
    expect(close.status).toBe('ok')
    const closed = close.data!.intent
    closed.status = 'reconciled'
    closed.reconciledAt = new Date().toISOString()

    const reopen = await runCommand(
      'setRoomTypeAvailability',
      ctx(principal()),
      {
        ...baseInput,
        availability: 2,
        compensatesIntentId: closed.id,
      },
      { store },
    )
    expect(reopen.status).toBe('ok')
    expect(reopen.data!.intent.id).not.toBe(closed.id)
    expect(reopen.data!.intent.compensatesIntentId).toBe(closed.id)
    expect(
      (reopen.data!.intent.payload as { values: { availability: number }[] })
        .values[0]?.availability,
    ).toBe(2)
    expect(store.auditEvents.some((e) => e.action === 'setRoomTypeAvailability')).toBe(
      true,
    )
  })

  it('multi-property fan-out is independent (one failure does not block sibling enqueue)', async () => {
    const store = createMemoryStore()
    enableAvailabilityWrite(store)
    store.ariAvailability.push(
      {
        networkId: 1,
        propertyId: 10,
        roomTypeId: 5,
        date: '2026-08-10',
        availability: 1,
        snapshotVersion: 1,
        pulledAt: new Date().toISOString(),
      },
      {
        networkId: 1,
        propertyId: 20,
        roomTypeId: 6,
        date: '2026-08-10',
        availability: 1,
        snapshotVersion: 1,
        pulledAt: new Date().toISOString(),
      },
    )

    const a = await runCommand(
      'setRoomTypeAvailability',
      ctx(principal()),
      {
        ...baseInput,
        propertyId: 10,
        roomTypeChannexId: 'rt-a',
        dateTo: '2026-08-10',
      },
      { store },
    )
    expect(a.status).toBe('ok')

    // Property 20 with stale version fails independently.
    const b = await runCommand(
      'setRoomTypeAvailability',
      ctx(principal(), { propertyId: 20 }),
      {
        ...baseInput,
        propertyId: 20,
        roomTypeId: 6,
        roomTypeChannexId: 'rt-b',
        dateTo: '2026-08-10',
        baseSnapshotVersion: 0,
      },
      { store },
    )
    expect(b.status).toBe('rejected')
    expect(b.error?.code).toBe('STALE_SNAPSHOT')
    expect(store.ariWriteIntents.filter((i) => i.propertyId === 10)).toHaveLength(1)
    expect(store.ariWriteIntents.filter((i) => i.propertyId === 20)).toHaveLength(0)
  })
})
