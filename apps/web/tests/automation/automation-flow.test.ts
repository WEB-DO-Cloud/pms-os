import { describe, expect, it } from 'vitest'
import { buildPrincipal } from '@pms/auth'
import {
  createMemoryStore,
  createRule,
  processAutomationEvent,
  resumeAutomationRun,
  runCommand,
} from '@pms/domain'

/**
 * Web-facing automation flow checks (domain path used by /api/automation/*).
 * Auth/HTTP wiring mirrors other module flow tests — command parity is the contract.
 */
describe('automation web flow', () => {
  it('booking-created rule creates task via the same createTask command as UI', async () => {
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
    })
    createRule(store, {
      networkId: 1,
      name: 'Turnover',
      trigger: 'booking_created',
      actions: [{ type: 'createTask', title: 'Clean unit', category: 'cleaning' }],
    })

    const [run] = await processAutomationEvent(
      {
        type: 'booking_created',
        networkId: 1,
        eventKey: 'web-rev-1',
        propertyId: 10,
        reservationId: 1,
      },
      { store },
    )

    expect(run?.status).toBe('succeeded')
    expect(store.tasks[0]?.title).toBe('Clean unit')
    expect(run?.actionsAttempted[0]?.commandName).toBe('createTask')
  })

  it('approval hold + approveAutomationAction resumes remaining actions', async () => {
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
    })
    createRule(store, {
      networkId: 1,
      name: 'Welcome',
      trigger: 'booking_created',
      actions: [
        {
          type: 'queueGuestMessage',
          body: 'Welcome',
          channel: 'email',
        },
      ],
    })

    const [run] = await processAutomationEvent(
      {
        type: 'booking_created',
        networkId: 1,
        eventKey: 'web-rev-2',
        propertyId: 10,
        reservationId: 1,
      },
      { store },
    )
    expect(run?.status).toBe('awaiting_approval')
    expect(store.outboundMessages).toHaveLength(0)

    const mgr = buildPrincipal({
      userId: 'mgr',
      networkId: 1,
      role: 'manager',
      networkWide: true,
      propertyIds: [],
    })!
    const approvalId = run!.actionsAttempted[0]!.approvalId!
    const approved = await runCommand(
      'approveAutomationAction',
      {
        principal: mgr,
        actorKind: 'user',
        networkId: 1,
        propertyId: 10,
      },
      { approvalId },
      { store },
    )
    expect(approved.status).toBe('ok')
    expect(store.outboundMessages).toHaveLength(1)

    const resumed = await resumeAutomationRun(store, 1, run!.id)
    expect(resumed.status).toBe('succeeded')
  })

  it('re-fire with same eventKey does not duplicate tasks', async () => {
    const store = createMemoryStore()
    createRule(store, {
      networkId: 1,
      name: 'Once',
      trigger: 'booking_created',
      actions: [{ type: 'createTask', title: 'Only once' }],
    })
    const event = {
      type: 'booking_created' as const,
      networkId: 1,
      eventKey: 'web-rev-3',
      propertyId: 10,
    }
    await processAutomationEvent(event, { store })
    await processAutomationEvent(event, { store })
    expect(store.tasks).toHaveLength(1)
    expect(store.automationRuns).toHaveLength(1)
  })
})
