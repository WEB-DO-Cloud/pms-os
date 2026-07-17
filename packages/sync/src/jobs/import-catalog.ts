import { importAllRoomTypes } from '../channex/room-types'
import { importProperties } from '../channex/properties'
import type { ChannexClient } from '../channex/client'
import { markSyncHealthy } from '../sync-health'
import type { SyncStore } from '../store'

const LEASE_TTL_MS = 60_000

export async function runCatalogImport(
  store: SyncStore,
  client: ChannexClient,
  networkId: number,
  holder: string,
  /** When set, only these Channex property IDs are imported (tenant scoping). */
  channexIds?: readonly string[],
): Promise<{ properties: { imported: number; updated: number }; roomTypes: { imported: number; updated: number } } | { skipped: true }> {
  if (!store.tryAcquireLease(networkId, 'import_catalog', holder, LEASE_TTL_MS)) {
    return { skipped: true }
  }
  try {
    const properties = await importProperties(store, client, networkId, channexIds)
    const roomTypes = await importAllRoomTypes(store, client, networkId)
    markSyncHealthy(store, networkId, { lastPullAt: new Date().toISOString() })
    return { properties, roomTypes }
  } finally {
    store.releaseLease(networkId, 'import_catalog', holder)
  }
}
