import { describe, expect, it } from 'vitest'
import { buildPrincipal } from '@pms/auth'
import {
  createMemoryStore,
  runCommand,
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

  it('direct booking stays pending_sync until marked synced by write-back', async () => {
    const store = createMemoryStore()
    const user = principal()

    const created = await runCommand(
      'createDirectReservation',
      ctx(user),
      {
        propertyId: 10,
        checkInDate: '2026-08-01',
        checkOutDate: '2026-08-03',
        guestName: 'Direct Guest',
      },
      { store },
    )
    expect(created.status).toBe('ok')
    expect(created.data).toMatchObject({
      status: 'pending_sync',
      channel: 'direct',
      pendingSyncReason: 'direct_booking_awaiting_channex',
    })
    expect(created.data?.status).not.toBe('confirmed')
  })
})
