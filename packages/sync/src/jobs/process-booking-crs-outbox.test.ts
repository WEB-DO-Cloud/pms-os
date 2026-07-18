import { describe, expect, it, vi } from 'vitest'
import { createMemorySyncStore } from '../store'
import type { ChannexClient } from '../channex/client'
import {
  processBookingCrsOutbox,
  sendOrResumeBookingCrsIntent,
} from './process-booking-crs-outbox'
import type { AriWriteIntentRecord } from '@pms/domain'

function seedBookingCrs(
  store: ReturnType<typeof createMemorySyncStore>,
  overrides: Partial<AriWriteIntentRecord> = {},
): AriWriteIntentRecord {
  const now = new Date().toISOString()
  store.domain.networkCapabilities.push({
    networkId: 1,
    bookingCrsWrite: true,
    availabilityWrite: false,
    rateRestrictionWrite: false,
    derivedRateWrite: false,
    aiApply: false,
    updatedAt: now,
  })
  store.upsertProperty({
    id: 10,
    networkId: 1,
    channexId: 'prop-cx',
    name: 'Test',
    slug: 'test',
    timezone: 'UTC',
    currency: 'USD',
    channexRaw: null,
  })
  const reservationId = store.domain.nextId('reservation')
  store.domain.reservations.push({
    id: reservationId,
    networkId: 1,
    propertyId: 10,
    roomTypeId: 5,
    status: 'pending_sync',
    checkInDate: '2026-08-01',
    checkOutDate: '2026-08-03',
    currency: 'USD',
    staffNotes: null,
    channexBookingId: null,
    pendingSyncReason: 'direct_booking_awaiting_channex',
    guestName: 'Direct Guest',
    guestEmail: null,
    adults: 2,
    children: 0,
    infants: 0,
    channel: 'direct',
    paymentCollect: null,
    paymentType: null,
    totalAmountMinor: null,
    operationalStatus: null,
    checkedInAt: null,
    checkedOutAt: null,
    otaReservationCode: `PMS-1-${reservationId}`,
  })
  const code = `PMS-1-${reservationId}`
  const intent: AriWriteIntentRecord = {
    id: store.domain.nextId('ari_write_intent'),
    networkId: 1,
    propertyId: 10,
    lane: 'booking_crs',
    idempotencyKey: `booking_crs:${code}`,
    payload: {
      property_id: null,
      ota_reservation_code: code,
      ota_name: 'Offline',
      arrival_date: '2026-08-01',
      departure_date: '2026-08-03',
      currency: 'USD',
      customer: { name: 'Direct', surname: 'Guest' },
      rooms: [
        {
          room_type_id: 'rt-uuid',
          rate_plan_id: 'rp-uuid',
          days: { '2026-08-01': '100.00', '2026-08-02': '100.00' },
          guests: [{ name: 'Direct', surname: 'Guest' }],
          occupancy: { adults: 2, children: 0, infants: 0 },
        },
      ],
      _local: { reservationId, roomTypeId: 5 },
    },
    resourceScope: {
      roomTypeChannexId: 'rt-uuid',
      ratePlanChannexId: 'rp-uuid',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-03',
    },
    baseSnapshotVersion: null,
    status: 'queued',
    channexTaskIds: [],
    warnings: [],
    attempts: 0,
    lastError: null,
    nextAttemptAt: null,
    actorPrincipalId: 'user-1',
    approvedByPrincipalId: null,
    compensatesIntentId: null,
    reconciledAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
  store.domain.ariWriteIntents.push(intent)
  return intent
}

describe('processBookingCrsOutbox', () => {
  it('sends queued intent via createBooking and marks accepted', async () => {
    const store = createMemorySyncStore()
    const intent = seedBookingCrs(store)
    const createBooking = vi.fn(async () => ({
      data: {
        id: 'bk-row',
        type: 'booking',
        attributes: { id: 'bk-row', status: 'new', booking_id: 'bk-accepted' },
      },
    }))
    const client = { createBooking } as unknown as ChannexClient

    const result = await processBookingCrsOutbox(store, client, 1)
    expect(result.sent).toBe(1)
    expect(createBooking).toHaveBeenCalledTimes(1)
    expect(intent.status).toBe('accepted')
    expect(intent.channexTaskIds).toEqual(['bk-accepted'])
    expect(store.domain.reservations[0]?.channexBookingId).toBe('bk-accepted')
    expect(store.domain.reservations[0]?.pendingSyncReason).toBe(
      'awaiting_channex_revision',
    )
  })

  it('AE6: restart after accepted skips POST (no duplicate create)', async () => {
    const store = createMemorySyncStore()
    const intent = seedBookingCrs(store, {
      status: 'accepted',
      attempts: 1,
      channexTaskIds: ['bk-already'],
    })
    const createBooking = vi.fn(async () => {
      throw new Error('should not POST again')
    })
    const client = { createBooking } as unknown as ChannexClient

    const first = await processBookingCrsOutbox(store, client, 1)
    const second = await processBookingCrsOutbox(store, client, 1)
    expect(createBooking).not.toHaveBeenCalled()
    expect(first.skipped).toBe(1)
    expect(second.skipped).toBe(1)
    expect(intent.status).toBe('accepted')
    expect(intent.channexTaskIds).toEqual(['bk-already'])
  })

  it('sendOrResumeBookingCrsIntent: accepted path never posts', async () => {
    const store = createMemorySyncStore()
    const intent = seedBookingCrs(store, {
      status: 'accepted',
      channexTaskIds: ['bk-1'],
    })
    const createBooking = vi.fn()
    const outcome = await sendOrResumeBookingCrsIntent(
      store,
      { createBooking } as unknown as ChannexClient,
      intent,
      'prop-cx',
    )
    expect(outcome).toMatchObject({
      ok: true,
      channexBookingId: 'bk-1',
      posted: false,
    })
    expect(createBooking).not.toHaveBeenCalled()
  })

  it('retry after 5xx does not leave accepted; next drain may POST once', async () => {
    const store = createMemorySyncStore()
    const intent = seedBookingCrs(store)
    const { ChannexApiError } = await import('../channex/client')
    const createBooking = vi
      .fn()
      .mockRejectedValueOnce(new ChannexApiError('Channex 503', 503))
      .mockResolvedValueOnce({
        data: {
          id: 'bk-row',
          type: 'booking',
          attributes: { id: 'bk-row', status: 'new', booking_id: 'bk-ok' },
        },
      })

    const client = { createBooking } as unknown as ChannexClient
    await processBookingCrsOutbox(store, client, 1)
    expect(intent.status).toBe('retry')
    expect(createBooking).toHaveBeenCalledTimes(1)

    intent.nextAttemptAt = null
    await processBookingCrsOutbox(store, client, 1)
    expect(intent.status).toBe('accepted')
    expect(createBooking).toHaveBeenCalledTimes(2)
  })
})
