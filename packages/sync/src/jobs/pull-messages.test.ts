import { describe, expect, it } from 'vitest'
import { ChannexApiError, type ChannexClient } from '../channex/client'
import { createMemorySyncStore } from '../store'
import { channexTimestamp, runMessagePull } from './pull-messages'

const THREAD_ID = '20d1b08c-190e-4068-a77d-4a909a21835d'
const OUR_CHANNEX_PROPERTY = '71d34923-a8be-4682-9625-e4a2f080df92'
const OTHER_CHANNEX_PROPERTY = 'ffffffff-0000-0000-0000-000000000000'
const CHANNEX_BOOKING = '4d8240fd-d709-454b-a866-08bca2a5a909'

function thread(id: string, propertyId: string, bookingId?: string) {
  return {
    id,
    type: 'message_thread',
    attributes: {
      title: 'Maldonado Roxy',
      is_closed: false,
      provider: 'AirBNB',
      message_count: 2,
    },
    relationships: {
      property: { data: { id: propertyId, type: 'property' } },
      ...(bookingId ? { booking: { data: { id: bookingId, type: 'booking' } } } : {}),
    },
  }
}

function fakeClient(overrides: Partial<ChannexClient> = {}): ChannexClient {
  return {
    listMessageThreads: async () => ({
      data: [
        thread(THREAD_ID, OUR_CHANNEX_PROPERTY, CHANNEX_BOOKING),
        thread('other-thread', OTHER_CHANNEX_PROPERTY),
      ],
    }),
    listThreadMessages: async (threadId: string) => ({
      data:
        threadId === THREAD_ID
          ? [
              {
                id: 'msg-guest-1',
                type: 'message',
                attributes: {
                  message: 'Is early check-in possible?',
                  sender: 'guest' as const,
                  inserted_at: '2026-07-17T10:00:00.000000',
                },
              },
              {
                id: 'msg-prop-1',
                type: 'message',
                attributes: {
                  message: 'Yes, from 1pm.',
                  sender: 'property' as const,
                  inserted_at: '2026-07-17T10:05:00.000000',
                },
              },
            ]
          : [],
    }),
    ...overrides,
  } as ChannexClient
}

function seededStore() {
  const store = createMemorySyncStore()
  store.upsertProperty({
    networkId: 1,
    channexId: OUR_CHANNEX_PROPERTY,
    name: 'Villa Test',
    slug: 'villa-test',
    address: null,
    city: null,
    country: null,
    timezone: null,
    currency: null,
    channexTitle: null,
    channexRaw: null,
    sourceUpdatedAt: null,
  })
  const propertyId = store.listProperties(1)[0]!.id
  store.domain.reservations.push({
    id: 501,
    networkId: 1,
    propertyId,
    status: 'confirmed',
    checkInDate: '2026-07-20',
    checkOutDate: '2026-07-22',
    currency: 'USD',
    staffNotes: null,
    channexBookingId: CHANNEX_BOOKING,
    pendingSyncReason: null,
    guestName: 'Roxy Maldonado',
  })
  return { store, propertyId }
}

describe('runMessagePull', () => {
  it('normalizes Channex UTC timestamps that omit an offset', () => {
    expect(channexTimestamp('2026-07-17T10:00:00.000000')).toBe(
      '2026-07-17T10:00:00.000Z',
    )
    expect(channexTimestamp('2026-07-17T10:00:00.000Z')).toBe(
      '2026-07-17T10:00:00.000Z',
    )
  })

  it('ingests guest+property messages mapped to local property and reservation', async () => {
    const { store, propertyId } = seededStore()
    const result = await runMessagePull(store, fakeClient(), 1, 'test')
    expect(result).toEqual({ skipped: false, threads: 1, inserted: 2 })

    const msgs = store.domain.channelMessages
    expect(msgs).toHaveLength(2)
    expect(msgs[0]).toMatchObject({
      networkId: 1,
      propertyId,
      reservationId: 501,
      channexThreadId: THREAD_ID,
      provider: 'AirBNB',
      sender: 'guest',
      body: 'Is early check-in possible?',
    })
    // Thread for another tenant's property must not leak in.
    expect(msgs.every((m) => m.propertyId === propertyId)).toBe(true)
  })

  it('dedupes by channex message id on repeat pulls', async () => {
    const { store } = seededStore()
    await runMessagePull(store, fakeClient(), 1, 'test')
    const again = await runMessagePull(store, fakeClient(), 1, 'test')
    expect(again).toEqual({ skipped: false, threads: 1, inserted: 0 })
    expect(store.domain.channelMessages).toHaveLength(2)
  })

  it('keeps reservationId null for inquiry threads without booking', async () => {
    const { store } = seededStore()
    const client = fakeClient({
      listMessageThreads: async () => ({
        data: [thread(THREAD_ID, OUR_CHANNEX_PROPERTY)],
      }),
    } as Partial<ChannexClient>)
    await runMessagePull(store, client, 1, 'test')
    expect(store.domain.channelMessages[0]?.reservationId).toBeNull()
  })

  it('skips gracefully when Messages app is not installed (403)', async () => {
    const { store } = seededStore()
    const client = fakeClient({
      listMessageThreads: async () => {
        throw new ChannexApiError('Channex 403', 403)
      },
    } as Partial<ChannexClient>)
    const result = await runMessagePull(store, client, 1, 'test')
    expect(result).toEqual({ skipped: true, reason: 'messages_app_not_installed' })
    expect(store.domain.channelMessages).toHaveLength(0)
  })
})
