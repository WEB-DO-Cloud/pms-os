import { describe, expect, it } from 'vitest'
import { buildPrincipal } from '@pms/auth'
import {
  createMemoryStore,
  filterTasksForPrincipal,
  isPropertyArchived,
  projectGuestsForPrincipal,
  runCommand,
  type ReservationRecord,
  type TaskRecord,
} from '@pms/domain'

function principal(
  overrides: Partial<Parameters<typeof buildPrincipal>[0]> = {},
) {
  return buildPrincipal({
    userId: 'ops-web-1',
    networkId: 1,
    role: 'manager',
    propertyIds: [10, 11],
    networkWide: false,
    ...overrides,
  })!
}

function task(
  partial: Partial<TaskRecord> & Pick<TaskRecord, 'id' | 'propertyId'>,
): TaskRecord {
  const now = '2026-07-16T12:00:00.000Z'
  return {
    networkId: 1,
    reservationId: null,
    title: 'Task',
    description: null,
    category: 'cleaning',
    status: 'todo',
    assignedToUserId: null,
    dueDate: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    ...partial,
  }
}

describe('operations web: housekeeping task scope', () => {
  it('filters to assigned tasks within property membership', () => {
    const hk = principal({
      role: 'housekeeping',
      userId: 'hk-9',
      propertyIds: [10],
    })
    const rows = [
      task({ id: 1, propertyId: 10, title: 'Mine', assignedToUserId: 'hk-9' }),
      task({ id: 2, propertyId: 10, title: 'Other', assignedToUserId: 'hk-8' }),
      task({ id: 3, propertyId: 11, title: 'Wrong prop', assignedToUserId: 'hk-9' }),
      task({ id: 4, propertyId: 10, title: 'Unassigned', assignedToUserId: null }),
    ]
    expect(filterTasksForPrincipal(rows, hk).map((t) => t.id)).toEqual([1])
  })
})

describe('operations web: guest message queue', () => {
  it('queues via runCommand and rejects unauthorized property replies', async () => {
    const store = createMemoryStore()
    store.reservations.push({
      id: 1,
      networkId: 1,
      propertyId: 10,
      status: 'confirmed',
      checkInDate: '2026-07-20',
      checkOutDate: '2026-07-22',
      currency: 'USD',
      staffNotes: null,
      channexBookingId: 'bk',
      pendingSyncReason: null,
      guestName: 'Ada',
      guestEmail: 'ada@example.com',
    } satisfies ReservationRecord)

    const desk = principal({
      role: 'front_desk',
      userId: 'desk-1',
      propertyIds: [10],
    })
    const ok = await runCommand(
      'queueGuestMessage',
      {
        principal: desk,
        actorKind: 'user',
        networkId: 1,
        propertyId: 10,
      },
      {
        reservationId: 1,
        propertyId: 10,
        body: 'See you soon',
        channel: 'channex',
      },
      { store },
    )
    expect(ok.status).toBe('ok')
    expect(store.outboundMessages).toHaveLength(1)

    const denied = await runCommand(
      'queueGuestMessage',
      {
        principal: principal({
          role: 'front_desk',
          userId: 'desk-2',
          propertyIds: [99],
        }),
        actorKind: 'user',
        networkId: 1,
        propertyId: 10,
      },
      {
        reservationId: 1,
        propertyId: 10,
        body: 'Nope',
        channel: 'channex',
      },
      { store },
    )
    expect(denied.status).toBe('rejected')
    expect(denied.error?.code).toBe('PROPERTY_SCOPE')
  })
})

describe('operations web: property soft-archive', () => {
  it('archives via updatePropertyOps and reports archived flag', async () => {
    const store = createMemoryStore()
    const mgr = principal({ role: 'manager', propertyIds: [10] })
    const result = await runCommand(
      'updatePropertyOps',
      {
        principal: mgr,
        actorKind: 'user',
        networkId: 1,
        propertyId: 10,
      },
      { propertyId: 10, archive: true, notes: 'Closed for season' },
      { store },
    )
    expect(result.status).toBe('ok')
    expect(isPropertyArchived(store.propertyOps[0]!)).toBe(true)
  })
})

describe('operations web: guest projection', () => {
  it('merges reservation guests with vip/notes enrichments in scope', () => {
    const store = createMemoryStore()
    store.reservations.push(
      {
        id: 1,
        networkId: 1,
        propertyId: 10,
        status: 'confirmed',
        checkInDate: '2026-07-20',
        checkOutDate: '2026-07-22',
        currency: 'USD',
        staffNotes: null,
        channexBookingId: null,
        pendingSyncReason: null,
        guestName: 'Ada Guest',
        guestEmail: 'ada@example.com',
      },
      {
        id: 2,
        networkId: 1,
        propertyId: 99,
        status: 'confirmed',
        checkInDate: '2026-07-20',
        checkOutDate: '2026-07-22',
        currency: 'USD',
        staffNotes: null,
        channexBookingId: null,
        pendingSyncReason: null,
        guestName: 'Hidden',
        guestEmail: 'hidden@example.com',
      },
    )
    store.guests.push({
      id: 1,
      networkId: 1,
      guestKey: 'ada@example.com',
      email: 'ada@example.com',
      displayName: 'Ada VIP',
      notes: 'Late check-in OK',
      vip: true,
      preferences: null,
      updatedAt: '2026-07-16T12:00:00.000Z',
    })

    const guests = projectGuestsForPrincipal(
      store.reservations,
      store.guests,
      principal({ propertyIds: [10] }),
    )
    expect(guests).toHaveLength(1)
    expect(guests[0]?.vip).toBe(true)
    expect(guests[0]?.displayName).toBe('Ada VIP')
    expect(guests[0]?.notes).toBe('Late check-in OK')
  })
})
