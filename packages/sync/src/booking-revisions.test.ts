import { describe, expect, it } from 'vitest'
import { createChannexClient } from './channex/client'
import { pullBookingRevisionFeed, fetchAndApplyRevision } from './channex/booking-revisions'
import { processAckOutbox } from './jobs/process-ack-outbox'
import {
  FIXTURE_NETWORK_ID,
  fixtureRevision,
  mockChannexFetch,
} from './fixtures/channex'
import { createMemorySyncStore } from './store'

function seedCatalog(store: ReturnType<typeof createMemorySyncStore>) {
  const prop = store.upsertProperty({
    networkId: FIXTURE_NETWORK_ID,
    channexId: 'prop-1',
    name: 'Test Property',
    slug: 'test-property',
    address: null,
    city: null,
    country: null,
    timezone: null,
    currency: null,
    channexTitle: 'Test Property',
    channexRaw: {},
    sourceUpdatedAt: null,
  })
  store.upsertRoomType({
    networkId: FIXTURE_NETWORK_ID,
    propertyId: prop.id,
    channexId: 'rt-1',
    name: 'Standard',
    capacity: 2,
    countOfRooms: 2,
    channexRaw: {},
    sourceUpdatedAt: null,
  })
  return prop
}

describe('booking revision apply', () => {
  it('applies new, modified, and cancelled revisions without duplicating', async () => {
    const store = createMemorySyncStore()
    seedCatalog(store)

    const revisions = [
      fixtureRevision('rev-1', { status: 'new', booking_id: 'bk-100' }),
      fixtureRevision('rev-2', {
        status: 'modified',
        booking_id: 'bk-100',
        arrival_date: '2026-08-02',
      }),
      fixtureRevision('rev-3', { status: 'cancelled', booking_id: 'bk-100' }),
    ]

    const fetchFn = mockChannexFetch({
      feed: { data: revisions },
      revisions: Object.fromEntries(revisions.map((r) => [r.id, r])),
    })
    const client = createChannexClient({ apiKey: 'key', fetchFn })

    const pull1 = await pullBookingRevisionFeed(store, client, FIXTURE_NETWORK_ID)
    expect(pull1.applied).toBe(3)
    expect(store.domain.bookingRevisions).toHaveLength(3)
    expect(store.domain.reservations).toHaveLength(1)
    expect(store.domain.reservations[0]?.status).toBe('cancelled')
    expect(store.domain.ackOutbox).toHaveLength(3)

    const pull2 = await pullBookingRevisionFeed(store, client, FIXTURE_NETWORK_ID)
    expect(pull2.duplicates).toBe(3)
    expect(store.domain.bookingRevisions).toHaveLength(3)
    expect(store.domain.reservations).toHaveLength(1)
  })

  it('failed apply creates dead letter and no ack', async () => {
    const store = createMemorySyncStore()
    // no property mapping

    const rev = fixtureRevision('rev-bad', { property_id: 'missing-prop' })
    const fetchFn = mockChannexFetch({
      feed: { data: [rev] },
    })
    const client = createChannexClient({ apiKey: 'key', fetchFn })

    const result = await pullBookingRevisionFeed(store, client, FIXTURE_NETWORK_ID)
    expect(result.deadLetters).toBe(1)
    expect(store.domain.ackOutbox).toHaveLength(0)
    expect(store.listDeadLetters(FIXTURE_NETWORK_ID)).toHaveLength(1)
    expect(store.getSyncHealth(FIXTURE_NETWORK_ID).status).toBe('failed')
  })

  it('unmapped room type dead-letters without ack', async () => {
    const store = createMemorySyncStore()
    store.upsertProperty({
      networkId: FIXTURE_NETWORK_ID,
      channexId: 'prop-1',
      name: 'P',
      slug: 'p',
      address: null,
      city: null,
      country: null,
      timezone: null,
      currency: null,
      channexTitle: 'P',
      channexRaw: {},
      sourceUpdatedAt: null,
    })

    const rev = fixtureRevision('rev-nort', { room_type_id: 'missing-rt' })
    const fetchFn = mockChannexFetch({ feed: { data: [rev] } })
    const client = createChannexClient({ apiKey: 'key', fetchFn })

    await pullBookingRevisionFeed(store, client, FIXTURE_NETWORK_ID)
    expect(store.domain.ackOutbox).toHaveLength(0)
    expect(store.listDeadLetters(FIXTURE_NETWORK_ID)[0]?.error).toContain('Unmapped room type')
  })

  it('ack failure after commit does not re-apply revision', async () => {
    const store = createMemorySyncStore()
    seedCatalog(store)

    const rev = fixtureRevision('rev-ack-fail')
    const fetchFn = mockChannexFetch({
      feed: { data: [rev] },
    })
    const client = createChannexClient({ apiKey: 'key', fetchFn })

    await pullBookingRevisionFeed(store, client, FIXTURE_NETWORK_ID)
    expect(store.domain.bookingRevisions).toHaveLength(1)

    const ack1 = await processAckOutbox(store, client, FIXTURE_NETWORK_ID, {
      failRevisionIds: new Set(['rev-ack-fail']),
    })
    expect(ack1.failed).toBe(1)
    expect(store.domain.ackOutbox[0]?.status).toBe('failed')

    const pull2 = await pullBookingRevisionFeed(store, client, FIXTURE_NETWORK_ID)
    expect(pull2.duplicates).toBe(1)
    expect(store.domain.bookingRevisions).toHaveLength(1)

    const ack2 = await processAckOutbox(store, client, FIXTURE_NETWORK_ID)
    expect(ack2.sent).toBe(1)
    expect(store.domain.ackOutbox[0]?.status).toBe('sent')
  })

  it('webhook fetch path converges with feed processing', async () => {
    const store = createMemorySyncStore()
    seedCatalog(store)

    const rev = fixtureRevision('rev-wh')
    const fetchFn = mockChannexFetch({
      revisions: { 'rev-wh': rev },
    })
    const client = createChannexClient({ apiKey: 'key', fetchFn })

    const applied = await fetchAndApplyRevision(store, client, FIXTURE_NETWORK_ID, 'rev-wh')
    expect(applied.status).toBe('applied')
    expect(store.domain.bookingRevisions).toHaveLength(1)
  })

  it('auto-assigns rooms deterministically and leaves overflow unassigned', async () => {
    const store = createMemorySyncStore()
    seedCatalog(store)
    const rooms = store
      .listPhysicalRooms(FIXTURE_NETWORK_ID)
      .filter((r) => !r.archivedAt)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    expect(rooms).toHaveLength(2)

    const revisions = [
      fixtureRevision('rev-a', {
        status: 'new',
        booking_id: 'bk-a',
        arrival_date: '2026-09-01',
        departure_date: '2026-09-03',
      }),
      fixtureRevision('rev-b', {
        status: 'new',
        booking_id: 'bk-b',
        arrival_date: '2026-09-01',
        departure_date: '2026-09-03',
      }),
      fixtureRevision('rev-c', {
        status: 'new',
        booking_id: 'bk-c',
        arrival_date: '2026-09-01',
        departure_date: '2026-09-03',
      }),
      // back-to-back can reuse first room
      fixtureRevision('rev-d', {
        status: 'new',
        booking_id: 'bk-d',
        arrival_date: '2026-09-03',
        departure_date: '2026-09-05',
      }),
    ]
    const fetchFn = mockChannexFetch({
      feed: { data: revisions },
      revisions: Object.fromEntries(revisions.map((r) => [r.id, r])),
    })
    const client = createChannexClient({ apiKey: 'key', fetchFn })
    await pullBookingRevisionFeed(store, client, FIXTURE_NETWORK_ID)

    const byBooking = Object.fromEntries(
      store.domain.reservations.map((r) => [r.channexBookingId, r]),
    )
    expect(byBooking['bk-a']?.roomTypeId).toBeTruthy()
    expect(byBooking['bk-a']?.roomId).toBe(rooms[0]!.id)
    expect(byBooking['bk-b']?.roomId).toBe(rooms[1]!.id)
    expect(byBooking['bk-c']?.roomId).toBeNull()
    expect(byBooking['bk-d']?.roomId).toBe(rooms[0]!.id)
  })

  it('releases room on cancel and reassigns when dates change into conflict', async () => {
    const store = createMemorySyncStore()
    seedCatalog(store)
    const rooms = store
      .listPhysicalRooms(FIXTURE_NETWORK_ID)
      .filter((r) => !r.archivedAt)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)

    const revs = [
      fixtureRevision('rev-1', {
        status: 'new',
        booking_id: 'bk-1',
        arrival_date: '2026-10-01',
        departure_date: '2026-10-04',
      }),
      fixtureRevision('rev-2', {
        status: 'new',
        booking_id: 'bk-2',
        arrival_date: '2026-10-04',
        departure_date: '2026-10-06',
      }),
    ]
    let fetchFn = mockChannexFetch({
      feed: { data: revs },
      revisions: Object.fromEntries(revs.map((r) => [r.id, r])),
    })
    let client = createChannexClient({ apiKey: 'key', fetchFn })
    await pullBookingRevisionFeed(store, client, FIXTURE_NETWORK_ID)
    expect(store.domain.reservations.find((r) => r.channexBookingId === 'bk-1')?.roomId).toBe(
      rooms[0]!.id,
    )
    expect(store.domain.reservations.find((r) => r.channexBookingId === 'bk-2')?.roomId).toBe(
      rooms[0]!.id,
    )

    const cancel = fixtureRevision('rev-1c', {
      status: 'cancelled',
      booking_id: 'bk-1',
      arrival_date: '2026-10-01',
      departure_date: '2026-10-04',
    })
    fetchFn = mockChannexFetch({
      feed: { data: [cancel] },
      revisions: { 'rev-1c': cancel },
    })
    client = createChannexClient({ apiKey: 'key', fetchFn })
    await pullBookingRevisionFeed(store, client, FIXTURE_NETWORK_ID)
    expect(store.domain.reservations.find((r) => r.channexBookingId === 'bk-1')?.roomId).toBeNull()
  })
})
