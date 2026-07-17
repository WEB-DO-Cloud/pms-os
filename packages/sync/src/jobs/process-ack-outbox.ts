import type { ChannexClient } from '../channex/client'
import { markSyncHealthy } from '../sync-health'
import type { SyncStore } from '../store'

export type AckOutboxResult = {
  sent: number
  failed: number
  skipped: number
}

export async function processAckOutbox(
  store: SyncStore,
  client: ChannexClient,
  networkId: number,
  opts?: { failRevisionIds?: Set<string> },
): Promise<AckOutboxResult> {
  let sent = 0
  let failed = 0
  let skipped = 0

  for (const ack of store.domain.ackOutbox) {
    if (ack.networkId !== networkId) continue
    if (ack.status === 'sent') {
      skipped++
      continue
    }
    if (opts?.failRevisionIds?.has(ack.channexRevisionId)) {
      ack.status = 'failed'
      ack.attempts++
      failed++
      continue
    }
    try {
      await client.ackBookingRevision(ack.channexRevisionId)
      ack.status = 'sent'
      ack.attempts++
      sent++
    } catch {
      ack.status = 'failed'
      ack.attempts++
      failed++
    }
  }

  if (sent > 0) {
    markSyncHealthy(store, networkId, { lastAckAt: new Date().toISOString() })
  }
  return { sent, failed, skipped }
}
