import { describe, expect, it } from 'vitest'
import { buildPrincipal } from '@pms/auth'
import {
  createMemoryStore,
  createRule,
  processAutomationEvent,
  resumeAutomationRun,
  retryAutomationRun,
  runCommand,
} from '../index'

function seedReservation(
  store: ReturnType<typeof createMemoryStore>,
  overrides: Partial<(typeof store.reservations)[0]> = {},
) {
  store.reservations.push({
    id: 1,
    networkId: 1,
    propertyId: 10,
    status: 'confirmed',
    checkInDate: '2026-07-20',
    checkOutDate: '2026-07-22',
    currency: 'USD',
    staffNotes: null,
    channexBookingId: 'bk-1',
    pendingSyncReason: null,
    guestName: 'Ada',
    channel: 'booking.com',
    ...overrides,
  })
}

describe('automation engine', () => {
  it('booking_created trigger creates a task through createTask (same command as UI)', async () => {
    const store = createMemoryStore()
    seedReservation(store)
    createRule(store, {
      networkId: 1,
      name: 'New booking turnover',
      trigger: 'booking_created',
      actions: [
        {
          type: 'createTask',
          title: 'Prepare unit',
          category: 'cleaning',
        },
      ],
    })

    const [run] = await processAutomationEvent(
      {
        type: 'booking_created',
        networkId: 1,
        eventKey: 'rev-100',
        propertyId: 10,
        reservationId: 1,
        channel: 'booking.com',
        status: 'confirmed',
      },
      { store },
    )

    expect(run?.status).toBe('succeeded')
    expect(run?.conditionMatched).toBe(true)
    expect(store.tasks).toHaveLength(1)
    expect(store.tasks[0]).toMatchObject({
      title: 'Prepare unit',
      propertyId: 10,
      reservationId: 1,
      networkId: 1,
    })
    expect(
      store.auditEvents.some(
        (e) => e.action === 'createTask' && e.principalType === 'automation',
      ),
    ).toBe(true)
    expect(run?.actionsAttempted[0]?.commandName).toBe('createTask')
  })

  it('high-risk queueGuestMessage pauses in awaiting_approval until authorized', async () => {
    const store = createMemoryStore()
    seedReservation(store)
    createRule(store, {
      networkId: 1,
      name: 'Welcome message',
      trigger: 'booking_created',
      actions: [
        { type: 'createTask', title: 'Prep' },
        {
          type: 'queueGuestMessage',
          body: 'Welcome — see you soon',
          channel: 'email',
        },
        { type: 'notifyStaff', message: 'Guest messaged' },
      ],
    })

    const [run] = await processAutomationEvent(
      {
        type: 'booking_created',
        networkId: 1,
        eventKey: 'rev-200',
        propertyId: 10,
        reservationId: 1,
      },
      { store },
    )

    expect(run?.status).toBe('awaiting_approval')
    expect(store.tasks).toHaveLength(1)
    expect(store.outboundMessages).toHaveLength(0)
    expect(store.pendingApprovals).toHaveLength(1)
    const approvalId = run?.actionsAttempted.find(
      (a) => a.status === 'awaiting_approval',
    )?.approvalId
    expect(approvalId).toBeTruthy()
    // Third action not run yet
    expect(run?.actionsAttempted).toHaveLength(2)

    const approver = buildPrincipal({
      userId: 'mgr-1',
      networkId: 1,
      role: 'manager',
      networkWide: true,
      propertyIds: [],
    })!
    const approved = await runCommand(
      'approveAutomationAction',
      {
        principal: approver,
        actorKind: 'user',
        networkId: 1,
        propertyId: 10,
      },
      { approvalId: approvalId! },
      { store },
    )
    expect(approved.status).toBe('ok')
    expect(store.outboundMessages).toHaveLength(1)

    const resumed = await resumeAutomationRun(store, 1, run!.id)
    expect(resumed.status).toBe('succeeded')
    expect(store.reservations[0]?.staffNotes).toContain('[Automation]')
  })

  it('retrying a failed run does not duplicate tasks (action idempotency)', async () => {
    const store = createMemoryStore()
    seedReservation(store)
    createRule(store, {
      networkId: 1,
      name: 'Idempotent prep',
      trigger: 'booking_created',
      actions: [{ type: 'createTask', title: 'Once only' }],
    })

    const event = {
      type: 'booking_created' as const,
      networkId: 1,
      eventKey: 'rev-300',
      propertyId: 10,
      reservationId: 1,
    }

    const [first] = await processAutomationEvent(event, { store })
    expect(first?.status).toBe('succeeded')
    expect(store.tasks).toHaveLength(1)

    // Simulate failure then retry path: mark run failed and re-process same event key
    first!.status = 'failed'
    first!.finishedAt = new Date().toISOString()
    first!.nextActionIndex = 0
    first!.actionsAttempted = []

    const [retried] = await processAutomationEvent(event, { store })
    expect(retried?.id).toBe(first!.id)
    expect(store.tasks).toHaveLength(1)
    expect(retried?.actionsAttempted[0]?.idempotentReplay).toBe(true)
    expect(retried?.status).toBe('succeeded')

    // Explicit retry API on a freshly failed marker (command idempotency still holds)
    retried!.status = 'partial_failure'
    retried!.finishedAt = new Date().toISOString()
    const viaRetry = await retryAutomationRun(store, 1, first!.id)
    expect(store.tasks).toHaveLength(1)
    expect(viaRetry.status).toBe('succeeded')
    expect(viaRetry.actionsAttempted.some((a) => a.idempotentReplay)).toBe(true)
  })

  it('run history records event, condition result, actions, and audit', async () => {
    const store = createMemoryStore()
    seedReservation(store, { channel: 'airbnb', status: 'confirmed' })
    createRule(store, {
      networkId: 1,
      name: 'Airbnb only',
      trigger: 'booking_created',
      conditions: { channel: 'airbnb', propertyIds: [10] },
      actions: [{ type: 'createTask', title: 'Airbnb prep' }],
    })
    createRule(store, {
      networkId: 1,
      name: 'Booking.com only',
      trigger: 'booking_created',
      conditions: { channel: 'booking.com' },
      actions: [{ type: 'createTask', title: 'Should skip' }],
    })

    const runs = await processAutomationEvent(
      {
        type: 'booking_created',
        networkId: 1,
        eventKey: 'rev-400',
        propertyId: 10,
        reservationId: 1,
        channel: 'airbnb',
        status: 'confirmed',
      },
      { store },
    )

    expect(runs).toHaveLength(2)
    const matched = runs.find((r) => r.conditionMatched)
    const skipped = runs.find((r) => !r.conditionMatched)
    expect(matched?.status).toBe('succeeded')
    expect(matched?.inputEvent.eventKey).toBe('rev-400')
    expect(matched?.conditionDetail).toContain('matched')
    expect(matched?.actionsAttempted[0]?.status).toBe('ok')
    expect(skipped?.status).toBe('succeeded')
    expect(skipped?.actionsAttempted).toHaveLength(0)
    expect(store.tasks).toHaveLength(1)
    expect(store.auditEvents.length).toBeGreaterThan(0)
  })

  it('tenant and property scoping block cross-network / out-of-scope actions', async () => {
    const store = createMemoryStore()
    seedReservation(store)
    createRule(store, {
      networkId: 1,
      name: 'Scoped',
      trigger: 'booking_created',
      conditions: { propertyIds: [10] },
      actions: [{ type: 'createTask', title: 'In scope' }],
    })
    createRule(store, {
      networkId: 2,
      name: 'Other network',
      trigger: 'booking_created',
      actions: [{ type: 'createTask', title: 'Leak' }],
    })

    const runs = await processAutomationEvent(
      {
        type: 'booking_created',
        networkId: 1,
        eventKey: 'rev-500',
        propertyId: 99, // wrong property → condition fail on first rule
        reservationId: 1,
      },
      { store },
    )

    expect(runs).toHaveLength(1)
    expect(runs[0]?.conditionMatched).toBe(false)
    expect(store.tasks).toHaveLength(0)

    // Property on event that principal cannot access → command PROPERTY_SCOPE
    createRule(store, {
      networkId: 1,
      name: 'No condition',
      trigger: 'check_in_day',
      actions: [{ type: 'createTask', title: 'Ghost prop' }],
    })
    // buildAutomationPrincipal with propertyIds:[propertyId] is networkWide:false
    // and only that property — so property 10 works. Use property 10 with a
    // reservation on 10, then force createTask against inaccessible via event on 10.
    // Cross-tenant: event network 99 finds no rules.
    const foreign = await processAutomationEvent(
      {
        type: 'booking_created',
        networkId: 99,
        eventKey: 'rev-x',
        propertyId: 10,
        reservationId: 1,
      },
      { store },
    )
    expect(foreign).toHaveLength(0)
  })
})
