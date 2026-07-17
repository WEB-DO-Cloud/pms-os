import { describe, expect, it } from 'vitest'
import { buildPrincipal } from '@pms/auth'
import {
  createMemoryStore,
  filterPropertyOpsActive,
  filterTasksForPrincipal,
  isPropertyArchived,
  runCommand,
  type CommandContext,
} from './index'

function principal(
  overrides: Partial<Parameters<typeof buildPrincipal>[0]> = {},
) {
  return buildPrincipal({
    userId: 'ops-1',
    networkId: 1,
    role: 'manager',
    propertyIds: [10, 11],
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
    ...partial,
  }
}

function seedReservation(
  store: ReturnType<typeof createMemoryStore>,
  propertyId = 10,
) {
  store.reservations.push({
    id: store.nextId('reservation'),
    networkId: 1,
    propertyId,
    status: 'confirmed',
    checkInDate: '2026-07-20',
    checkOutDate: '2026-07-22',
    currency: 'USD',
    staffNotes: null,
    channexBookingId: 'bk-1',
    pendingSyncReason: null,
    guestName: 'Ada Guest',
    guestEmail: 'ada@example.com',
  })
}

describe('operations: task assignment scope', () => {
  it('housekeeping only sees tasks assigned to them within property scope', async () => {
    const store = createMemoryStore()
    const manager = principal({ role: 'manager', userId: 'mgr-1' })
    const hk = principal({
      role: 'housekeeping',
      userId: 'hk-1',
      propertyIds: [10],
    })

    await runCommand(
      'createTask',
      ctx(manager, { propertyId: 10 }),
      {
        title: 'Mine',
        propertyId: 10,
        category: 'cleaning',
        assignedToUserId: 'hk-1',
      },
      { store },
    )
    await runCommand(
      'createTask',
      ctx(manager, { propertyId: 10 }),
      {
        title: 'Other HK',
        propertyId: 10,
        category: 'cleaning',
        assignedToUserId: 'hk-2',
      },
      { store },
    )
    await runCommand(
      'createTask',
      ctx(manager, { propertyId: 11 }),
      {
        title: 'Out of property',
        propertyId: 11,
        category: 'cleaning',
        assignedToUserId: 'hk-1',
      },
      { store },
    )

    const visible = filterTasksForPrincipal(store.tasks, hk)
    expect(visible.map((t) => t.title)).toEqual(['Mine'])
  })
})

describe('operations: guest message queue', () => {
  it('queues outbound message for in-scope reservation and rejects out of scope', async () => {
    const store = createMemoryStore()
    seedReservation(store, 10)
    const desk = principal({
      role: 'front_desk',
      userId: 'desk-1',
      propertyIds: [10],
    })

    const ok = await runCommand(
      'queueGuestMessage',
      ctx(desk, { propertyId: 10 }),
      {
        reservationId: store.reservations[0]!.id,
        propertyId: 10,
        body: 'Welcome',
        channel: 'channex',
      },
      { store },
    )
    expect(ok.status).toBe('ok')
    expect(store.outboundMessages).toHaveLength(1)
    expect(store.outboundMessages[0]?.status).toBe('queued')

    const outsider = principal({
      role: 'front_desk',
      userId: 'desk-2',
      propertyIds: [99],
    })
    const denied = await runCommand(
      'queueGuestMessage',
      ctx(outsider, { propertyId: 10 }),
      {
        reservationId: store.reservations[0]!.id,
        propertyId: 10,
        body: 'Nope',
        channel: 'channex',
      },
      { store },
    )
    expect(denied.status).toBe('rejected')
    expect(denied.error?.code).toBe('PROPERTY_SCOPE')
    expect(store.outboundMessages).toHaveLength(1)
  })
})

describe('operations: property soft-archive', () => {
  it('soft-archives via updatePropertyOps and hides from active lists', async () => {
    const store = createMemoryStore()
    const mgr = principal({ role: 'manager', propertyIds: [10] })

    const archived = await runCommand(
      'updatePropertyOps',
      ctx(mgr, { propertyId: 10 }),
      { propertyId: 10, notes: 'Seasonal close', archive: true },
      { store },
    )
    expect(archived.status).toBe('ok')
    expect(store.propertyOps[0]?.status).toBe('archived')
    expect(store.propertyOps[0]?.archivedAt).toBeTruthy()

    expect(isPropertyArchived(store.propertyOps[0]!)).toBe(true)
    expect(filterPropertyOpsActive(store.propertyOps)).toHaveLength(0)

    await runCommand(
      'updatePropertyOps',
      ctx(mgr, { propertyId: 10 }),
      { propertyId: 10, archive: false },
      { store },
    )
    expect(store.propertyOps[0]?.status).toBe('active')
    expect(store.propertyOps[0]?.archivedAt).toBeNull()
    expect(filterPropertyOpsActive(store.propertyOps)).toHaveLength(1)
  })
})
