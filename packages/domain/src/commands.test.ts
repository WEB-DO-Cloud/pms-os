import { describe, expect, it } from 'vitest'
import { buildPrincipal } from '@pms/auth'
import {
  createMemoryStore,
  runCommand,
  type CommandContext,
  type CommandResult,
} from './index'

function principal(
  overrides: Partial<Parameters<typeof buildPrincipal>[0]> = {},
) {
  return buildPrincipal({
    userId: 'user-1',
    networkId: 1,
    role: 'manager',
    propertyIds: [10],
    networkWide: true,
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

function seedReservation(store: ReturnType<typeof createMemoryStore>) {
  store.reservations.push({
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
    guestName: 'Ada',
  })
}

describe('domain commands', () => {
  it('enforces tenant/network and property scope before mutation', async () => {
    const store = createMemoryStore()
    const scoped = principal({
      role: 'front_desk',
      networkWide: false,
      propertyIds: [10],
    })

    const ok = await runCommand(
      'createTask',
      ctx(scoped, { networkId: 1, propertyId: 10 }),
      { title: 'Turnover', propertyId: 10, category: 'cleaning' },
      { store },
    )
    expect(ok.status).toBe('ok')
    expect(store.tasks).toHaveLength(1)

    const badNet = await runCommand(
      'createTask',
      ctx(scoped, { networkId: 2, propertyId: 10 }),
      { title: 'Leak', propertyId: 10, category: 'cleaning' },
      { store },
    )
    expect(badNet.status).toBe('rejected')
    expect(badNet.error?.code).toBe('NETWORK_SCOPE')
    expect(store.tasks).toHaveLength(1)
  })

  it('UI and automation invoking the same command produce the same outcome shape and audit', async () => {
    const storeUi = createMemoryStore()
    const storeAuto = createMemoryStore()
    const user = principal({ userId: 'user-1', role: 'manager' })
    const automation = principal({ userId: 'automation:rule-9', role: 'manager' })

    const input = {
      title: 'Inspect HVAC',
      propertyId: 10,
      category: 'maintenance' as const,
    }

    const uiResult = await runCommand(
      'createTask',
      ctx(user, { actorKind: 'user', networkId: 1, propertyId: 10 }),
      input,
      { store: storeUi },
    )
    const autoResult = await runCommand(
      'createTask',
      ctx(automation, {
        actorKind: 'automation',
        networkId: 1,
        propertyId: 10,
      }),
      input,
      { store: storeAuto },
    )

    expect(uiResult.status).toBe('ok')
    expect(autoResult.status).toBe('ok')
    expect(uiResult.data).toMatchObject({
      title: 'Inspect HVAC',
      propertyId: 10,
      status: 'todo',
      networkId: 1,
    })
    expect(autoResult.data).toMatchObject({
      title: 'Inspect HVAC',
      propertyId: 10,
      status: 'todo',
      networkId: 1,
    })

    const uiAudit = storeUi.auditEvents[0]
    const autoAudit = storeAuto.auditEvents[0]
    expect(uiAudit).toMatchObject({
      action: 'createTask',
      networkId: 1,
      resourceType: 'task',
    })
    expect(autoAudit).toMatchObject({
      action: 'createTask',
      networkId: 1,
      resourceType: 'task',
    })
    expect(uiAudit.principalType).toBe('user')
    expect(autoAudit.principalType).toBe('automation')
    expect(Object.keys(uiAudit).sort()).toEqual(Object.keys(autoAudit).sort())
  })

  it('high-risk automation commands await approval instead of executing', async () => {
    const store = createMemoryStore()
    seedReservation(store)
    const automation = principal({ userId: 'automation:1', role: 'manager' })

    const result = await runCommand(
      'queueGuestMessage',
      ctx(automation, {
        actorKind: 'automation',
        networkId: 1,
        propertyId: 10,
      }),
      {
        reservationId: 1,
        propertyId: 10,
        body: 'Your checkout is tomorrow',
        channel: 'email',
      },
      { store },
    )

    expect(result.status).toBe('awaiting_approval')
    expect(result.approvalId).toBeTruthy()
    expect(store.outboundMessages).toHaveLength(0)
    expect(store.pendingApprovals).toHaveLength(1)
    expect(store.auditEvents.some((e) => e.action === 'queueGuestMessage')).toBe(
      true,
    )
  })

  it('idempotency keys prevent duplicate command effects', async () => {
    const store = createMemoryStore()
    const user = principal()
    const key = 'idem-create-task-1'
    const input = {
      title: 'Once only',
      propertyId: 10,
      category: 'other' as const,
    }

    const first = await runCommand(
      'createTask',
      ctx(user, { networkId: 1, propertyId: 10, idempotencyKey: key }),
      input,
      { store },
    )
    const second = await runCommand(
      'createTask',
      ctx(user, { networkId: 1, propertyId: 10, idempotencyKey: key }),
      input,
      { store },
    )

    expect(first.status).toBe('ok')
    expect(second.status).toBe('ok')
    expect(second.idempotentReplay).toBe(true)
    expect(store.tasks).toHaveLength(1)
    expect((second.data as { id: number }).id).toBe(
      (first.data as { id: number }).id,
    )
  })

  it('cannot use forged network/property to mutate out-of-scope reservation notes', async () => {
    const store = createMemoryStore()
    store.reservations.push({
      id: 5,
      networkId: 2,
      propertyId: 20,
      status: 'confirmed',
      checkInDate: '2026-07-20',
      checkOutDate: '2026-07-22',
      currency: 'USD',
      staffNotes: null,
      channexBookingId: null,
      pendingSyncReason: null,
      guestName: 'Other tenant',
    })
    const user = principal({
      networkId: 1,
      networkWide: false,
      propertyIds: [10],
      role: 'front_desk',
    })

    const result = await runCommand(
      'attachReservationNote',
      ctx(user, { networkId: 1, propertyId: 10 }),
      { reservationId: 5, propertyId: 10, note: 'Forged' },
      { store },
    )

    expect(result.status).toBe('rejected')
    expect(result.error?.code).toMatch(/NOT_FOUND|NETWORK_SCOPE|PROPERTY_SCOPE/)
    expect(store.reservations[0].staffNotes).toBeNull()
  })

  it('payment ledger is append-only; corrections use compensating events', async () => {
    const store = createMemoryStore()
    seedReservation(store)
    const accounting = principal({
      role: 'accounting',
      networkWide: false,
      propertyIds: [10],
    })

    const pay = await runCommand(
      'recordLedgerPayment',
      ctx(accounting, { networkId: 1, propertyId: 10 }),
      {
        reservationId: 1,
        propertyId: 10,
        type: 'payment',
        amountMinor: 5000,
        currency: 'USD',
        note: 'Card payment',
      },
      { store },
    )
    expect(pay.status).toBe('ok')
    expect(store.ledger).toHaveLength(1)
    const originalId = (pay.data as { id: number }).id

    const refund = await runCommand(
      'recordLedgerPayment',
      ctx(accounting, { networkId: 1, propertyId: 10 }),
      {
        reservationId: 1,
        propertyId: 10,
        type: 'refund',
        amountMinor: 5000,
        currency: 'USD',
        note: 'Compensating refund',
        compensatesEntryId: originalId,
      },
      { store },
    )
    expect(refund.status).toBe('ok')
    expect(store.ledger).toHaveLength(2)
    expect(store.ledger[0]).toMatchObject({
      id: originalId,
      type: 'payment',
      amountMinor: 5000,
    })
    expect(store.ledger[1]).toMatchObject({
      type: 'refund',
      amountMinor: 5000,
      compensatesEntryId: originalId,
    })
    // original row unchanged (append-only)
    expect(store.ledger[0].note).toBe('Card payment')
  })

  it('createDirectReservation stays pending_sync and flags external sync recovery', async () => {
    const store = createMemoryStore()
    const user = principal({ role: 'front_desk', propertyIds: [10], networkWide: false })

    const result = await runCommand(
      'createDirectReservation',
      ctx(user, { networkId: 1, propertyId: 10 }),
      {
        propertyId: 10,
        checkInDate: '2026-08-01',
        checkOutDate: '2026-08-03',
        guestName: 'Grace',
        adults: 2,
      },
      { store },
    )

    expect(result.status).toBe('ok')
    expect(result.data).toMatchObject({
      status: 'pending_sync',
      pendingSyncReason: 'direct_booking_awaiting_channex',
      propertyId: 10,
      networkId: 1,
    })
    expect(result.meta?.needsExternalSyncRecovery).toBe(true)
  })

  it('applyChannexBookingRevision claims revision + ack outbox without Channex HTTP', async () => {
    const store = createMemoryStore()
    const syncPrincipal = principal({
      userId: 'system:sync',
      role: 'org_admin',
      networkWide: true,
    })

    const first = await runCommand(
      'applyChannexBookingRevision',
      ctx(syncPrincipal, {
        actorKind: 'sync',
        networkId: 1,
        propertyId: 10,
        idempotencyKey: 'rev-abc',
      }),
      {
        propertyId: 10,
        channexRevisionId: 'rev-abc',
        channexBookingId: 'bk-1',
        revisionStatus: 'new',
        checkInDate: '2026-09-01',
        checkOutDate: '2026-09-05',
        guestName: 'Sync Guest',
        payload: { id: 'bk-1' },
      },
      { store },
    )

    expect(first.status).toBe('ok')
    expect(store.bookingRevisions).toHaveLength(1)
    expect(store.ackOutbox).toHaveLength(1)
    expect(store.ackOutbox[0]).toMatchObject({
      channexRevisionId: 'rev-abc',
      status: 'pending',
    })
    expect(store.reservations).toHaveLength(1)

    const replay = await runCommand(
      'applyChannexBookingRevision',
      ctx(syncPrincipal, {
        actorKind: 'sync',
        networkId: 1,
        propertyId: 10,
        idempotencyKey: 'rev-abc',
      }),
      {
        propertyId: 10,
        channexRevisionId: 'rev-abc',
        channexBookingId: 'bk-1',
        revisionStatus: 'new',
        checkInDate: '2026-09-01',
        checkOutDate: '2026-09-05',
        guestName: 'Sync Guest',
        payload: { id: 'bk-1' },
      },
      { store },
    )

    expect(replay.status).toBe('ok')
    expect(replay.idempotentReplay).toBe(true)
    expect(store.bookingRevisions).toHaveLength(1)
    expect(store.ackOutbox).toHaveLength(1)
  })

  it('manager can approve a pending high-risk automation action', async () => {
    const store = createMemoryStore()
    seedReservation(store)
    const automation = principal({ userId: 'automation:1', role: 'manager' })
    const manager = principal({ userId: 'mgr-1', role: 'manager' })

    const pending = await runCommand(
      'queueGuestMessage',
      ctx(automation, {
        actorKind: 'automation',
        networkId: 1,
        propertyId: 10,
      }),
      {
        reservationId: 1,
        propertyId: 10,
        body: 'Welcome',
        channel: 'email',
      },
      { store },
    )
    expect(pending.status).toBe('awaiting_approval')

    const approved = await runCommand(
      'approveAutomationAction',
      ctx(manager, { networkId: 1 }),
      { approvalId: pending.approvalId! },
      { store },
    )

    expect(approved.status).toBe('ok')
    expect(store.outboundMessages).toHaveLength(1)
    expect(store.pendingApprovals[0].status).toBe('approved')
  })

  it('updateTaskStatus and attachReservationNote mutate only allowed fields', async () => {
    const store = createMemoryStore()
    seedReservation(store)
    const user = principal({ role: 'front_desk', propertyIds: [10], networkWide: false })

    const task = await runCommand(
      'createTask',
      ctx(user, { networkId: 1, propertyId: 10 }),
      { title: 'Clean', propertyId: 10, category: 'cleaning' },
      { store },
    )
    const taskId = (task.data as { id: number }).id

    const updated = await runCommand(
      'updateTaskStatus',
      ctx(user, { networkId: 1, propertyId: 10 }),
      { taskId, propertyId: 10, status: 'done' },
      { store },
    )
    expect(updated.status).toBe('ok')
    expect(store.tasks[0].status).toBe('done')

    const noted = await runCommand(
      'attachReservationNote',
      ctx(user, { networkId: 1, propertyId: 10 }),
      { reservationId: 1, propertyId: 10, note: 'Late arrival' },
      { store },
    )
    expect(noted.status).toBe('ok')
    expect(store.reservations[0].staffNotes).toContain('Late arrival')
  })
})

describe('command risk metadata', () => {
  it('exposes risk / approval / sync-recovery flags on results', async () => {
    const store = createMemoryStore()
    seedReservation(store)
    const user = principal({ role: 'accounting', propertyIds: [10], networkWide: false })

    const result: CommandResult = await runCommand(
      'recordLedgerPayment',
      ctx(user, { networkId: 1, propertyId: 10 }),
      {
        reservationId: 1,
        propertyId: 10,
        type: 'payment',
        amountMinor: 100,
        currency: 'USD',
      },
      { store },
    )

    expect(result.meta).toMatchObject({
      risk: 'high',
      compensatingAction: 'reverse_ledger',
      requiresApproval: false,
      supportsDryRun: true,
    })
  })
})

describe('calendar day actions (U4)', () => {
  it('creates a task with a property-local due date from the calendar cell', async () => {
    const store = createMemoryStore()
    const desk = principal({ role: 'front_desk', networkWide: false, propertyIds: [10] })
    const result = await runCommand(
      'createTask',
      ctx(desk),
      {
        title: 'Deep clean',
        propertyId: 10,
        category: 'cleaning',
        dueDate: '2026-08-05',
      },
      { store },
    )
    expect(result.status).toBe('ok')
    expect(store.tasks[0]).toMatchObject({ dueDate: '2026-08-05' })
  })

  it('rejects malformed due dates', async () => {
    const store = createMemoryStore()
    const result = await runCommand(
      'createTask',
      ctx(principal()),
      { title: 'Bad date', propertyId: 10, dueDate: 'tomorrow' },
      { store },
    )
    expect(result.status).toBe('rejected')
    expect(result.error?.code).toBe('VALIDATION')
    expect(store.tasks).toHaveLength(0)
  })

  it('creates, edits, and deletes a property/date note without touching tasks', async () => {
    const store = createMemoryStore()
    const desk = principal({ role: 'front_desk', networkWide: false, propertyIds: [10] })

    const created = await runCommand(
      'createCalendarNote',
      ctx(desk),
      { propertyId: 10, date: '2026-08-05', body: 'Pool maintenance day' },
      { store },
    )
    expect(created.status).toBe('ok')
    const note = created.data as { id: number }
    expect(store.calendarNotes[0]).toMatchObject({
      propertyId: 10,
      date: '2026-08-05',
      body: 'Pool maintenance day',
      createdByUserId: desk.userId,
    })
    expect(store.tasks).toHaveLength(0)

    const updated = await runCommand(
      'updateCalendarNote',
      ctx(desk),
      { noteId: note.id, propertyId: 10, body: 'Pool closed until 2pm' },
      { store },
    )
    expect(updated.status).toBe('ok')
    expect(store.calendarNotes[0]?.body).toBe('Pool closed until 2pm')

    const deleted = await runCommand(
      'deleteCalendarNote',
      ctx(desk),
      { noteId: note.id, propertyId: 10 },
      { store },
    )
    expect(deleted.status).toBe('ok')
    expect(store.calendarNotes).toHaveLength(0)
  })

  it('scopes notes per property and date without collisions', async () => {
    const store = createMemoryStore()
    const mgr = principal()
    await runCommand(
      'createCalendarNote',
      ctx(mgr),
      { propertyId: 10, date: '2026-08-05', body: 'A' },
      { store },
    )
    await runCommand(
      'createCalendarNote',
      ctx(mgr, { propertyId: 11 }),
      { propertyId: 11, date: '2026-08-05', body: 'B' },
      { store },
    )
    await runCommand(
      'createCalendarNote',
      ctx(mgr),
      { propertyId: 10, date: '2026-08-06', body: 'C' },
      { store },
    )
    expect(store.calendarNotes).toHaveLength(3)
    expect(new Set(store.calendarNotes.map((n) => n.id)).size).toBe(3)
  })

  it('denies out-of-scope property note mutations', async () => {
    const store = createMemoryStore()
    const desk = principal({ role: 'front_desk', networkWide: false, propertyIds: [10] })
    const result = await runCommand(
      'createCalendarNote',
      ctx(desk, { propertyId: 99 }),
      { propertyId: 99, date: '2026-08-05', body: 'Nope' },
      { store },
    )
    expect(result.status).toBe('rejected')
    expect(result.error?.code).toBe('PROPERTY_SCOPE')
    expect(store.calendarNotes).toHaveLength(0)
  })

  it('rejects editing a note that belongs to another property', async () => {
    const store = createMemoryStore()
    const mgr = principal()
    const created = await runCommand(
      'createCalendarNote',
      ctx(mgr),
      { propertyId: 10, date: '2026-08-05', body: 'A' },
      { store },
    )
    const note = created.data as { id: number }
    const result = await runCommand(
      'updateCalendarNote',
      ctx(mgr, { propertyId: 11 }),
      { noteId: note.id, propertyId: 11, body: 'Hijack' },
      { store },
    )
    expect(result.status).toBe('rejected')
    expect(result.error?.code).toBe('NOT_FOUND')
  })
})
