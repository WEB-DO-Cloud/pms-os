import type { ChannexClient } from './client'
import { applyBookingRevision } from '../apply-revision'
import { markSyncHealthy } from '../sync-health'
import type { SyncStore } from '../store'

export type ProcessFeedResult = {
  processed: number
  applied: number
  duplicates: number
  deadLetters: number
}

export async function pullBookingRevisionFeed(
  store: SyncStore,
  client: ChannexClient,
  networkId: number,
): Promise<ProcessFeedResult> {
  const feed = await client.getBookingRevisionFeed()
  let processed = 0
  let applied = 0
  let duplicates = 0
  let deadLetters = 0

  for (const item of feed.data ?? []) {
    processed++
    const result = await store.transaction(async () =>
      applyBookingRevision(store, networkId, item.attributes, item),
    )
    if (result.status === 'applied') applied++
    else if (result.status === 'duplicate') duplicates++
    else if (result.status === 'dead_letter' || result.status === 'rejected') deadLetters++
  }

  if (deadLetters > 0) {
    store.updateSyncHealth(networkId, { lastPullAt: new Date().toISOString() })
  } else {
    markSyncHealthy(store, networkId, { lastPullAt: new Date().toISOString() })
  }
  return { processed, applied, duplicates, deadLetters }
}

export async function fetchAndApplyRevision(
  store: SyncStore,
  client: ChannexClient,
  networkId: number,
  revisionId: string,
) {
  const res = await client.getBookingRevision(revisionId)
  return store.transaction(async () =>
    applyBookingRevision(store, networkId, res.data.attributes, res.data),
  )
}
