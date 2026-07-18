import type { ChannelMessageRecord } from '@pms/domain'
import { ChannexApiError } from '../channex/client'
import type { ChannexClient } from '../channex/client'
import type { ChannexResource } from '../channex/types'
import type { SyncStore } from '../store'

const LEASE_TTL_MS = 120_000

function relationshipId(
  resource: ChannexResource<unknown>,
  name: string,
): string | null {
  const rel = resource.relationships?.[name]?.data
  if (!rel) return null
  return Array.isArray(rel) ? (rel[0]?.id ?? null) : rel.id
}

export type MessagePullResult =
  | { skipped: true; reason: 'lease' | 'messages_app_not_installed' }
  | { skipped: false; threads: number; inserted: number }

/** Channex timestamps are UTC but may omit the offset and include microseconds. */
export function channexTimestamp(value: string | undefined): string {
  if (!value) return new Date().toISOString()
  const hasOffset = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
  return new Date(hasOffset ? value : `${value}Z`).toISOString()
}

/**
 * Pull OTA chat threads + messages from Channex into the domain store.
 * ponytail: single page of threads/messages per tick (100 each) and in-memory
 * store only — upgrade path is cursoring on last_message_received_at + PG rows.
 */
export async function runMessagePull(
  store: SyncStore,
  client: ChannexClient,
  networkId: number,
  holder: string,
): Promise<MessagePullResult> {
  if (!store.tryAcquireLease(networkId, 'pull_messages', holder, LEASE_TTL_MS)) {
    return { skipped: true, reason: 'lease' }
  }
  try {
    let threadsRes
    try {
      threadsRes = await client.listMessageThreads()
    } catch (err) {
      // 403 = Messages app not installed on the property; not a sync failure.
      if (err instanceof ChannexApiError && err.status === 403) {
        return { skipped: true, reason: 'messages_app_not_installed' }
      }
      throw err
    }

    const seen = new Set(
      store.domain.channelMessages
        .filter((m) => m.networkId === networkId)
        .map((m) => m.channexMessageId),
    )
    const reservationByBookingId = new Map(
      store.domain.reservations
        .filter(
          (reservation) =>
            reservation.networkId === networkId && reservation.channexBookingId,
        )
        .map((reservation) => [reservation.channexBookingId!, reservation]),
    )

    let threads = 0
    let inserted = 0
    for (const thread of threadsRes.data ?? []) {
      const channexPropertyId = relationshipId(thread, 'property')
      if (!channexPropertyId) continue
      const property = store.findPropertyByChannexId(networkId, channexPropertyId)
      // Commercial master key sees every tenant's threads — only ingest ours.
      if (!property) continue
      threads++

      const channexBookingId = relationshipId(thread, 'booking')
      const reservation = channexBookingId
        ? reservationByBookingId.get(channexBookingId)
        : null

      const messagesRes = await client.listThreadMessages(thread.id)
      for (const msg of messagesRes.data ?? []) {
        if (seen.has(msg.id)) continue
        seen.add(msg.id)
        const record: ChannelMessageRecord = {
          id: store.domain.nextId('channel_message'),
          networkId,
          propertyId: property.id,
          reservationId: reservation?.id ?? null,
          channexThreadId: thread.id,
          channexMessageId: msg.id,
          provider: thread.attributes.provider ?? null,
          threadTitle: thread.attributes.title ?? null,
          sender: msg.attributes.sender ?? 'guest',
          body: msg.attributes.message ?? '',
          receivedAt: channexTimestamp(msg.attributes.inserted_at),
          createdAt: new Date().toISOString(),
        }
        store.domain.channelMessages.push(record)
        inserted++
      }
    }
    return { skipped: false, threads, inserted }
  } finally {
    store.releaseLease(networkId, 'pull_messages', holder)
  }
}
