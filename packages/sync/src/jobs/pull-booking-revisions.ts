import { pullBookingRevisionFeed } from '../channex/booking-revisions'
import type { ChannexClient } from '../channex/client'
import type { SyncStore } from '../store'

const LEASE_TTL_MS = 120_000

export async function runBookingRevisionPull(
  store: SyncStore,
  client: ChannexClient,
  networkId: number,
  holder: string,
) {
  if (!store.tryAcquireLease(networkId, 'pull_revisions', holder, LEASE_TTL_MS)) {
    return { skipped: true as const }
  }
  try {
    return { skipped: false as const, ...(await pullBookingRevisionFeed(store, client, networkId)) }
  } finally {
    store.releaseLease(networkId, 'pull_revisions', holder)
  }
}
