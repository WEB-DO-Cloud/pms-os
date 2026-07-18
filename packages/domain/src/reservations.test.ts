import { describe, expect, it } from 'vitest'
import { buildPrincipal } from '@pms/auth'
import {
  createMemoryStore,
  offlineReservationCode,
  runCommand,
  stayNightDates,
  type CommandContext,
} from './index'

function principal(
  overrides: Partial<Parameters<typeof buildPrincipal>[0]> = {},
) {
  return buildPrincipal({
    userId: 'user-1',
    networkId: 1,
    role: 'front_desk',
    propertyIds: [10],
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

function enableBookingCrs(store: ReturnType<typeof createMemoryStore>) {
  store.networkCapabilities.push({
    networkId: 1,
    bookingCrsWrite: true,
    availabilityWrite: false,
    rateRestrictionWrite: false,
    derivedRateWrite: false,
    aiApply: false,
    updatedAt: new Date().toISOString(),
  })
}

const crsInput = {
  propertyId: 10,
  checkInDate: '2026-08-01',
  checkOutDate: '2026-08-03',
  guestName: 'Direct Guest',
  roomTypeId: 5,
  roomTypeChannexId: 'rt-uuid',
  ratePlanChannexId: 'rp-uuid',
  days: { '2026-08-01': '100.00', '2026-08-02': '110.00' },
  adults: 2,
}

function seedConfirmed(store: ReturnType<typeof createMemoryStore>) {
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
    operationalStatus: null,
    checkedInAt: null,
    checkedOutAt: null,
  })
}

describe('reservation check-in / check-out', () => {
  it('check-in sets PMS operational fields and writes audit without touching Channex status', async () => {
    const store = createMemoryStore()
    seedConfirmed(store)
    const user = principal()

    const result = await runCommand(
      'checkInReservation',
      ctx(user),
      { reservationId: 1, propertyId: 10 },
      { store },
    )

    expect(result.status).toBe('ok')
    expect(store.reservations[0]).toMatchObject({
      status: 'confirmed',
      operationalStatus: 'checked_in',
      channexBookingId: 'bk-1',
    })
    expect(store.reservations[0].checkedInAt).toBeTruthy()
    expect(store.auditEvents.some((a) => a.action === 'checkInReservation')).toBe(
      true,
    )
  })

  it('check-out requires prior check-in and does not overwrite Channex-owned fields', async () => {
    const store = createMemoryStore()
    seedConfirmed(store)
    const user = principal()

    const early = await runCommand(
      'checkOutReservation',
      ctx(user),
      { reservationId: 1, propertyId: 10 },
      { store },
    )
    expect(early.status).toBe('rejected')
    expect(early.error?.code).toBe('CONFLICT')

    await runCommand(
      'checkInReservation',
      ctx(user),
      { reservationId: 1, propertyId: 10 },
      { store },
    )
    const notesBefore = store.reservations[0].staffNotes
    const channexBefore = store.reservations[0].channexBookingId

    const out = await runCommand(
      'checkOutReservation',
      ctx(user),
      { reservationId: 1, propertyId: 10 },
      { store },
    )
    expect(out.status).toBe('ok')
    expect(store.reservations[0]).toMatchObject({
      status: 'confirmed',
      operationalStatus: 'checked_out',
      channexBookingId: channexBefore,
      staffNotes: notesBefore,
    })
    expect(store.reservations[0].checkedOutAt).toBeTruthy()
  })

  it('blocks check-in for pending_sync and out-of-scope properties', async () => {
    const store = createMemoryStore()
    store.reservations.push({
      id: 2,
      networkId: 1,
      propertyId: 10,
      status: 'pending_sync',
      checkInDate: '2026-08-01',
      checkOutDate: '2026-08-03',
      currency: 'USD',
      staffNotes: null,
      channexBookingId: null,
      pendingSyncReason: 'direct_booking_awaiting_channex',
      guestName: 'Grace',
    })
    store.reservations.push({
      id: 3,
      networkId: 1,
      propertyId: 99,
      status: 'confirmed',
      checkInDate: '2026-08-01',
      checkOutDate: '2026-08-03',
      currency: 'USD',
      staffNotes: null,
      channexBookingId: 'bk-x',
      pendingSyncReason: null,
      guestName: 'Other',
    })
    const user = principal({ propertyIds: [10], networkWide: false })

    const pending = await runCommand(
      'checkInReservation',
      ctx(user),
      { reservationId: 2, propertyId: 10 },
      { store },
    )
    expect(pending.status).toBe('rejected')
    expect(pending.error?.code).toBe('CONFLICT')

    const scoped = await runCommand(
      'checkInReservation',
      ctx(user, { propertyId: 99 }),
      { reservationId: 3, propertyId: 99 },
      { store },
    )
    expect(scoped.status).toBe('rejected')
    expect(scoped.error?.code).toBe('PROPERTY_SCOPE')
  })
})

describe('Booking CRS direct creation (U5)', () => {
  it('AE2: capability off rejects before enqueue (no local reservation)', async () => {
    const store = createMemoryStore()
    const user = principal()
    const created = await runCommand(
      'createDirectReservation',
      ctx(user),
      crsInput,
      { store },
    )
    expect(created.status).toBe('rejected')
    expect(created.error?.code).toBe('CAPABILITY_OFF')
    expect(store.reservations).toHaveLength(0)
    expect(store.ariWriteIntents).toHaveLength(0)
  })

  it('rejects missing CRS fields before enqueue', async () => {
    const store = createMemoryStore()
    enableBookingCrs(store)
    const user = principal()
    const missingDays = await runCommand(
      'createDirectReservation',
      ctx(user),
      { ...crsInput, days: { '2026-08-01': '100.00' } },
      { store },
    )
    expect(missingDays.status).toBe('rejected')
    expect(missingDays.error?.code).toBe('VALIDATION')
    expect(store.reservations).toHaveLength(0)
  })

  it('enqueues booking_crs intent and stays pending_sync with stable offline code', async () => {
    const store = createMemoryStore()
    enableBookingCrs(store)
    const user = principal()

    const created = await runCommand(
      'createDirectReservation',
      ctx(user),
      crsInput,
      { store },
    )
    expect(created.status).toBe('ok')
    expect(created.data).toMatchObject({
      status: 'pending_sync',
      channel: 'direct',
      pendingSyncReason: 'direct_booking_awaiting_channex',
      roomTypeId: 5,
    })
    expect(created.data?.status).not.toBe('confirmed')
    const code = offlineReservationCode(1, created.data!.id)
    expect(created.data?.otaReservationCode).toBe(code)
    expect(store.ariWriteIntents).toHaveLength(1)
    expect(store.ariWriteIntents[0]).toMatchObject({
      lane: 'booking_crs',
      status: 'queued',
      idempotencyKey: `booking_crs:${code}`,
    })
    expect(stayNightDates('2026-08-01', '2026-08-03')).toEqual([
      '2026-08-01',
      '2026-08-02',
    ])
  })

  it('idempotent double-submit same key → one booking and one intent', async () => {
    const store = createMemoryStore()
    enableBookingCrs(store)
    const user = principal()
    const key = 'direct-idem-1'

    const first = await runCommand(
      'createDirectReservation',
      ctx(user, { idempotencyKey: key }),
      crsInput,
      { store },
    )
    const second = await runCommand(
      'createDirectReservation',
      ctx(user, { idempotencyKey: key }),
      { ...crsInput, guestName: 'Different' },
      { store },
    )
    expect(first.status).toBe('ok')
    expect(second.status).toBe('ok')
    expect(second.idempotentReplay).toBe(true)
    expect(store.reservations).toHaveLength(1)
    expect(store.ariWriteIntents).toHaveLength(1)
    expect(first.data?.otaReservationCode).toBe(second.data?.otaReservationCode)
  })

  it('AE3: revision match by ota code confirms pending Offline booking', async () => {
    const store = createMemoryStore()
    enableBookingCrs(store)
    const user = principal()
    const created = await runCommand(
      'createDirectReservation',
      ctx(user),
      crsInput,
      { store },
    )
    expect(created.status).toBe('ok')
    const code = created.data!.otaReservationCode!

    const syncPrincipal = principal({
      userId: 'system:sync',
      role: 'org_admin',
      networkWide: true,
    })
    const applied = await runCommand(
      'applyChannexBookingRevision',
      ctx(syncPrincipal, { actorKind: 'sync', propertyId: 10 }),
      {
        propertyId: 10,
        channexRevisionId: 'rev-offline-1',
        channexBookingId: 'bk-chx-9',
        revisionStatus: 'new',
        checkInDate: '2026-08-01',
        checkOutDate: '2026-08-03',
        guestName: 'Direct Guest',
        otaReservationCode: code,
      },
      { store },
    )
    expect(applied.status).toBe('ok')
    expect(store.reservations).toHaveLength(1)
    expect(store.reservations[0]).toMatchObject({
      status: 'confirmed',
      channexBookingId: 'bk-chx-9',
      pendingSyncReason: null,
      otaReservationCode: code,
    })
    expect(store.ariWriteIntents[0]?.status).toBe('reconciled')
  })
})
