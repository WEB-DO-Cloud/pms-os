import { describe, expect, it } from 'vitest'
import { buildPrincipal } from '@pms/auth'
import { createMemoryStore, runCommand, type ReservationRecord } from '@pms/domain'
import {
  applyWriteBackResult,
  buildCalendarProjection,
  filterReservationsForPrincipal,
  isPendingSync,
  toCalendarBars,
} from '../../server/lib/reservation-query'
import { createDirectBooking } from '../../server/utils/reservations'
import { getSyncStore } from '../../server/utils/sync'

function principal(
  overrides: Partial<Parameters<typeof buildPrincipal>[0]> = {},
) {
  return buildPrincipal({
    userId: 'desk-1',
    networkId: 1,
    role: 'front_desk',
    propertyIds: [10, 11],
    networkWide: false,
    ...overrides,
  })!
}

function reservation(
  partial: Partial<ReservationRecord> & Pick<ReservationRecord, 'id' | 'propertyId'>,
): ReservationRecord {
  return {
    networkId: 1,
    status: 'confirmed',
    checkInDate: '2026-07-20',
    checkOutDate: '2026-07-22',
    currency: 'USD',
    staffNotes: null,
    channexBookingId: 'bk',
    pendingSyncReason: null,
    guestName: 'Guest',
    ...partial,
  }
}

function seedCatalogForBookingCrs(networkId = 1, propertyId = 10) {
  const sync = getSyncStore(networkId)
  sync.domain.networkCapabilities = [
    {
      networkId,
      bookingCrsWrite: true,
      availabilityWrite: false,
      rateRestrictionWrite: false,
      derivedRateWrite: false,
      aiApply: false,
      updatedAt: new Date().toISOString(),
    },
  ]
  sync.domain.reservations = sync.domain.reservations.filter((r) => r.networkId !== networkId)
  sync.domain.ariWriteIntents = sync.domain.ariWriteIntents.filter(
    (i) => i.networkId !== networkId,
  )
  sync.domain.ratePlans = sync.domain.ratePlans.filter((p) => p.networkId !== networkId)

  const prop =
    sync.listProperties(networkId).find((p) => p.id === propertyId) ??
    sync.upsertProperty({
      id: propertyId,
      networkId,
      channexId: 'prop-uuid',
      name: 'Casa',
      slug: 'casa',
      address: null,
      city: null,
      country: null,
      timezone: 'UTC',
      currency: 'USD',
      channexTitle: 'Casa',
      channexRaw: null,
      sourceUpdatedAt: null,
    })

  const other =
    sync.listProperties(networkId).find((p) => p.id === 11) ??
    sync.upsertProperty({
      id: 11,
      networkId,
      channexId: 'prop-other',
      name: 'Other',
      slug: 'other',
      address: null,
      city: null,
      country: null,
      timezone: 'UTC',
      currency: 'USD',
      channexTitle: 'Other',
      channexRaw: null,
      sourceUpdatedAt: null,
    })

  const room =
    sync.listRoomTypes(networkId, propertyId).find((r) => r.channexId === 'rt-uuid') ??
    sync.upsertRoomType({
      networkId,
      propertyId: prop.id,
      channexId: 'rt-uuid',
      name: 'Studio',
      capacity: 2,
      countOfRooms: 1,
      channexRaw: null,
      sourceUpdatedAt: null,
    })

  if (!sync.listRoomTypes(networkId, other.id).some((r) => r.channexId === 'rt-other')) {
    sync.upsertRoomType({
      networkId,
      propertyId: other.id,
      channexId: 'rt-other',
      name: 'Other RT',
      capacity: 2,
      countOfRooms: 1,
      channexRaw: null,
      sourceUpdatedAt: null,
    })
  }

  sync.domain.ratePlans.push({
    networkId,
    propertyId: prop.id,
    channexId: 'rp-uuid',
    roomTypeChannexId: 'rt-uuid',
    title: 'BAR',
    currency: 'USD',
    parentRatePlanChannexId: null,
    channexRaw: null,
    pulledAt: new Date().toISOString(),
  })
  sync.domain.ratePlans.push({
    networkId,
    propertyId: other.id,
    channexId: 'rp-other',
    roomTypeChannexId: 'rt-other',
    title: 'Other BAR',
    currency: 'USD',
    parentRatePlanChannexId: null,
    channexRaw: null,
    pulledAt: new Date().toISOString(),
  })

  return { sync, room }
}

describe('reservation property scope', () => {
  it('hides inaccessible properties from calendar/list projections', () => {
    const rows = [
      reservation({ id: 1, propertyId: 10, guestName: 'In scope' }),
      reservation({ id: 2, propertyId: 99, guestName: 'Hidden' }),
      reservation({ id: 3, propertyId: 11, guestName: 'Also in' }),
    ]
    const scoped = filterReservationsForPrincipal(rows, principal())
    expect(scoped.map((r) => r.id)).toEqual([1, 3])

    const bars = toCalendarBars(scoped, [
      { id: 10, name: 'Casa' },
      { id: 11, name: 'Nacar' },
      { id: 99, name: 'Secret' },
    ])
    expect(bars.every((b) => b.propertyId === 10 || b.propertyId === 11)).toBe(true)
    expect(bars.find((b) => b.propertyId === 99)).toBeUndefined()
  })

  it('respects explicit property filter within scope', () => {
    const rows = [
      reservation({ id: 1, propertyId: 10 }),
      reservation({ id: 2, propertyId: 11 }),
    ]
    const only = filterReservationsForPrincipal(rows, principal(), { propertyId: 10 })
    expect(only).toHaveLength(1)
    expect(only[0]?.propertyId).toBe(10)
  })
})

describe('pending-sync direct booking semantics', () => {
  it('failed Channex write keeps pending_sync and never looks confirmed', async () => {
    const store = createMemoryStore()
    store.networkCapabilities.push({
      networkId: 1,
      bookingCrsWrite: true,
      availabilityWrite: false,
      rateRestrictionWrite: false,
      derivedRateWrite: false,
      aiApply: false,
      updatedAt: new Date().toISOString(),
    })
    const user = principal()
    const created = await runCommand(
      'createDirectReservation',
      {
        principal: user,
        actorKind: 'user',
        networkId: 1,
        propertyId: 10,
      },
      {
        propertyId: 10,
        checkInDate: '2026-08-01',
        checkOutDate: '2026-08-03',
        guestName: 'Direct',
        roomTypeId: 5,
        roomTypeChannexId: 'rt-1',
        ratePlanChannexId: 'rp-1',
        days: { '2026-08-01': '90.00', '2026-08-02': '90.00' },
      },
      { store },
    )
    expect(created.status).toBe('ok')
    const row = store.reservations[0]!
    expect(isPendingSync(row)).toBe(true)

    applyWriteBackResult(row, { ok: false, reason: 'channex_write_failed' })
    expect(row.status).toBe('pending_sync')
    expect(row.pendingSyncReason).toBe('channex_write_failed')
    expect(row.status).not.toBe('confirmed')
  })

  it('HTTP accept keeps pending until reconciled; revision confirm clears pending', () => {
    const row = reservation({
      id: 9,
      propertyId: 10,
      status: 'pending_sync',
      channexBookingId: null,
      pendingSyncReason: 'direct_booking_awaiting_channex',
      otaReservationCode: 'PMS-1-9',
    })
    applyWriteBackResult(row, {
      ok: true,
      channexBookingId: 'CHX-100',
      reconciled: false,
    })
    expect(row.status).toBe('pending_sync')
    expect(row.channexBookingId).toBe('CHX-100')
    expect(row.pendingSyncReason).toBe('awaiting_channex_revision')
    expect(isPendingSync(row)).toBe(true)

    applyWriteBackResult(row, {
      ok: true,
      channexBookingId: 'CHX-100',
      reconciled: true,
    })
    expect(row.status).toBe('confirmed')
    expect(row.pendingSyncReason).toBeNull()
    expect(isPendingSync(row)).toBe(false)
  })

  it('date-range filter keeps overlapping stays for calendar', () => {
    const rows = [
      reservation({ id: 1, propertyId: 10, checkInDate: '2026-07-18', checkOutDate: '2026-07-21' }),
      reservation({ id: 2, propertyId: 10, checkInDate: '2026-07-25', checkOutDate: '2026-07-28' }),
    ]
    const week = filterReservationsForPrincipal(rows, principal(), {
      from: '2026-07-20',
      to: '2026-07-24',
    })
    expect(week.map((r) => r.id)).toEqual([1])
  })
})

describe('Booking CRS createDirectBooking gates', () => {
  it('AE2: capability off → server rejects with no reservation', async () => {
    const sync = getSyncStore(1)
    sync.domain.networkCapabilities = []
    await expect(
      createDirectBooking(
        principal(),
        {
          propertyId: 10,
          checkInDate: '2026-08-10',
          checkOutDate: '2026-08-12',
          guestName: 'No Cap',
          roomTypeId: 1,
          ratePlanChannexId: 'rp-uuid',
          days: { '2026-08-10': '100.00', '2026-08-11': '100.00' },
        },
        async () => ({ ok: false, reason: 'should_not_run' }),
      ),
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('rejects cross-property room type / rate plan ids', async () => {
    const { room } = seedCatalogForBookingCrs()
    await expect(
      createDirectBooking(
        principal(),
        {
          propertyId: 10,
          checkInDate: '2026-08-10',
          checkOutDate: '2026-08-12',
          guestName: 'Cross',
          roomTypeId: room.id,
          ratePlanChannexId: 'rp-other',
          days: { '2026-08-10': '100.00', '2026-08-11': '100.00' },
        },
        async () => ({ ok: false, reason: 'should_not_run' }),
      ),
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('idempotent double-submit same key → one reservation; HTTP accept stays pending', async () => {
    const { room } = seedCatalogForBookingCrs()
    const key = `test-idem-${Date.now()}`
    const input = {
      propertyId: 10,
      checkInDate: '2026-08-20',
      checkOutDate: '2026-08-22',
      guestName: 'Idem Guest',
      roomTypeId: room.id,
      ratePlanChannexId: 'rp-uuid',
      days: { '2026-08-20': '120.00', '2026-08-21': '120.00' },
      idempotencyKey: key,
    }
    const wb = async () =>
      ({ ok: true, channexBookingId: 'bk-accepted', reconciled: false }) as const

    const first = await createDirectBooking(principal(), input, wb)
    const second = await createDirectBooking(principal(), input, wb)
    expect(first.reservation.id).toBe(second.reservation.id)
    expect(first.displayStatus).toBe('pending_sync')
    expect(first.reservation.pendingSyncReason).toBe('awaiting_channex_revision')
    expect(
      getSyncStore(1).domain.reservations.filter(
        (r) => r.otaReservationCode === first.reservation.otaReservationCode,
      ),
    ).toHaveLength(1)
  })

  it('timeout after send resumes reconciliation without second create', async () => {
    const { room, sync } = seedCatalogForBookingCrs()
    const key = `resume-${Date.now()}`
    let postAttempts = 0
    const writeBack = async (reservation: ReservationRecord) => {
      const intent = sync.domain.ariWriteIntents.find(
        (i) => i.idempotencyKey === `booking_crs:${reservation.otaReservationCode}`,
      )!
      if (intent.status === 'accepted' || intent.channexTaskIds.length > 0) {
        return {
          ok: true as const,
          channexBookingId: intent.channexTaskIds[0] ?? 'bk-already-sent',
          reconciled: false,
        }
      }
      postAttempts++
      intent.status = 'accepted'
      intent.channexTaskIds = ['bk-already-sent']
      return { ok: true as const, channexBookingId: 'bk-already-sent', reconciled: false }
    }

    const first = await createDirectBooking(
      principal(),
      {
        propertyId: 10,
        checkInDate: '2026-09-01',
        checkOutDate: '2026-09-03',
        guestName: 'Resume Guest',
        roomTypeId: room.id,
        ratePlanChannexId: 'rp-uuid',
        days: { '2026-09-01': '80.00', '2026-09-02': '80.00' },
        idempotencyKey: key,
      },
      writeBack,
    )
    expect(first.reservation.channexBookingId).toBe('bk-already-sent')
    expect(postAttempts).toBe(1)

    const resumed = await createDirectBooking(
      principal(),
      {
        propertyId: 10,
        checkInDate: '2026-09-01',
        checkOutDate: '2026-09-03',
        guestName: 'Resume Guest',
        roomTypeId: room.id,
        ratePlanChannexId: 'rp-uuid',
        days: { '2026-09-01': '80.00', '2026-09-02': '80.00' },
        idempotencyKey: key,
      },
      writeBack,
    )
    expect(resumed.reservation.id).toBe(first.reservation.id)
    expect(postAttempts).toBe(1)
    expect(resumed.displayStatus).toBe('pending_sync')
  })
})

describe('mixed hotel / vacation-rental calendar projection', () => {
  it('expands hotels into room rows and keeps VR as property rows', () => {
    const { rows, bars } = buildCalendarProjection(
      [
        { id: 10, name: 'Grand Hotel', isHotel: true },
        { id: 11, name: 'Beach Villa', isHotel: false },
      ],
      [
        {
          id: 101,
          propertyId: 10,
          roomTypeId: 1,
          roomTypeName: 'King',
          label: '101',
          sortOrder: 1,
          archivedAt: null,
        },
        {
          id: 102,
          propertyId: 10,
          roomTypeId: 1,
          roomTypeName: 'King',
          label: '102',
          sortOrder: 2,
          archivedAt: null,
        },
      ],
      [
        reservation({
          id: 1,
          propertyId: 10,
          roomId: 101,
          guestName: 'Hotel Guest',
        }),
        reservation({
          id: 2,
          propertyId: 10,
          roomId: null,
          guestName: 'Overflow',
        }),
        reservation({
          id: 3,
          propertyId: 11,
          guestName: 'VR Guest',
        }),
      ],
    )

    expect(rows.map((r) => r.key)).toEqual([
      'room:101',
      'room:102',
      'unassigned:10',
      'property:11',
    ])
    expect(bars.find((b) => b.id === 1)?.rowKey).toBe('room:101')
    expect(bars.find((b) => b.id === 2)?.rowKey).toBe('unassigned:10')
    expect(bars.find((b) => b.id === 3)?.rowKey).toBe('property:11')
  })

  it('ignores archived rooms and routes those bars to unassigned', () => {
    const { rows, bars } = buildCalendarProjection(
      [{ id: 10, name: 'Hotel', isHotel: true }],
      [
        {
          id: 1,
          propertyId: 10,
          roomTypeId: 1,
          roomTypeName: 'Std',
          label: '1',
          sortOrder: 1,
          archivedAt: '2026-07-01T00:00:00.000Z',
        },
        {
          id: 2,
          propertyId: 10,
          roomTypeId: 1,
          roomTypeName: 'Std',
          label: '2',
          sortOrder: 2,
          archivedAt: null,
        },
      ],
      [reservation({ id: 9, propertyId: 10, roomId: 1 })],
    )
    expect(rows.some((r) => r.key === 'room:1')).toBe(false)
    expect(rows.some((r) => r.key === 'room:2')).toBe(true)
    expect(bars[0]?.rowKey).toBe('unassigned:10')
  })
})
