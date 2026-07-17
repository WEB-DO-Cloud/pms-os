/**
 * Drizzle-backed sync store — loads catalog/health/physical rooms from PG, domain via memory bridge.
 * ponytail: full PG transaction bridge deferred; memory store used for command path in web util.
 */
import { eq } from 'drizzle-orm'
import {
  networkSecrets,
  physicalRooms,
  properties,
  roomTypes,
  syncHealth,
  type Db,
} from '@pms/db'
import { createMemorySyncStore, type SyncStore, type NetworkSecretKind } from './memory-store'

export function createDrizzleSyncStore(db: Db, networkId: number): SyncStore {
  const store = createMemorySyncStore()

  void (async () => {
    const propRows = await db.select().from(properties).where(eq(properties.networkId, networkId))
    for (const p of propRows) {
      store.upsertProperty({
        id: p.id,
        networkId: p.networkId,
        channexId: p.channexId,
        name: p.name,
        slug: p.slug,
        address: p.address,
        city: p.city,
        country: p.country,
        timezone: p.timezone,
        currency: p.currency,
        channexTitle: p.channexTitle,
        channexRaw: p.channexRaw,
        sourceUpdatedAt: p.sourceUpdatedAt?.toISOString() ?? null,
      })
    }
    const rtRows = await db.select().from(roomTypes).where(eq(roomTypes.networkId, networkId))
    for (const r of rtRows) {
      store.upsertRoomType({
        id: r.id,
        networkId: r.networkId,
        propertyId: r.propertyId,
        channexId: r.channexId,
        name: r.name,
        capacity: r.capacity,
        countOfRooms: r.countOfRooms,
        channexRaw: r.channexRaw,
        sourceUpdatedAt: r.sourceUpdatedAt?.toISOString() ?? null,
      })
    }
    // Overlay durable physical-room labels/archives after catalog reconcile.
    const roomRows = await db
      .select()
      .from(physicalRooms)
      .where(eq(physicalRooms.networkId, networkId))
    for (const r of roomRows) {
      store.upsertPhysicalRoom({
        id: r.id,
        networkId: r.networkId,
        propertyId: r.propertyId,
        roomTypeId: r.roomTypeId,
        slotIndex: r.slotIndex,
        label: r.label,
        sortOrder: r.sortOrder,
        archivedAt: r.archivedAt?.toISOString() ?? null,
      })
    }
    const healthRow = await db
      .select()
      .from(syncHealth)
      .where(eq(syncHealth.networkId, networkId))
      .then((rows) => rows[0])
    if (healthRow) {
      store.updateSyncHealth(networkId, {
        status: healthRow.status,
        lastPullAt: healthRow.lastPullAt?.toISOString() ?? null,
        lastWebhookAt: healthRow.lastWebhookAt?.toISOString() ?? null,
        lastAckAt: healthRow.lastAckAt?.toISOString() ?? null,
        lastErrorCode: healthRow.lastErrorCode,
        lastErrorMessage: healthRow.lastErrorMessage,
      })
    }
    const secretRows = await db
      .select()
      .from(networkSecrets)
      .where(eq(networkSecrets.networkId, networkId))
    for (const s of secretRows) {
      store.setSecret(
        networkId,
        s.kind as NetworkSecretKind,
        s.ciphertext,
        s.iv,
        s.keyVersion,
      )
    }
  })()

  return store
}

export { createDb } from '@pms/db'
export type { Db } from '@pms/db'
