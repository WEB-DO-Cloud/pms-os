import { and, eq } from 'drizzle-orm'
import { physicalRooms } from '@pms/db'
import type { PhysicalRoomRow, SyncStore } from '@pms/sync'
import { getDb } from './auth'

/** Persist SyncStore physical rooms for a network to PG when DATABASE_URL is set. */
export async function persistPhysicalRooms(
  store: SyncStore,
  networkId: number,
): Promise<void> {
  if (!process.env.DATABASE_URL) return
  try {
    const db = getDb()
    const rows = store.listPhysicalRooms(networkId)
    for (const r of rows) {
      const existing = await db
        .select({ id: physicalRooms.id })
        .from(physicalRooms)
        .where(
          and(
            eq(physicalRooms.roomTypeId, r.roomTypeId),
            eq(physicalRooms.slotIndex, r.slotIndex),
          ),
        )
        .then((x) => x[0])
      if (existing) {
        await db
          .update(physicalRooms)
          .set({
            label: r.label,
            sortOrder: r.sortOrder,
            archivedAt: r.archivedAt ? new Date(r.archivedAt) : null,
            updatedAt: new Date(),
          })
          .where(eq(physicalRooms.id, existing.id))
      } else {
        await db.insert(physicalRooms).values({
          networkId: r.networkId,
          propertyId: r.propertyId,
          roomTypeId: r.roomTypeId,
          slotIndex: r.slotIndex,
          label: r.label,
          sortOrder: r.sortOrder,
          archivedAt: r.archivedAt ? new Date(r.archivedAt) : null,
        })
      }
    }
  } catch {
    // ponytail: unit tests / missing migration — memory rooms still work
  }
}

export async function hydratePhysicalRooms(
  store: SyncStore,
  networkId: number,
): Promise<void> {
  if (!process.env.DATABASE_URL) return
  try {
    const db = getDb()
    const rows = await db
      .select()
      .from(physicalRooms)
      .where(eq(physicalRooms.networkId, networkId))
    for (const r of rows) {
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
  } catch {
    // ignore
  }
}

export function updatePhysicalRoomLabel(
  store: SyncStore,
  networkId: number,
  propertyId: number,
  roomId: number,
  patch: { label?: string; sortOrder?: number },
): PhysicalRoomRow {
  const room = store.findPhysicalRoom(networkId, roomId)
  if (!room || room.propertyId !== propertyId) {
    throw Object.assign(new Error('Room not found'), { statusCode: 404 })
  }
  if (patch.label !== undefined) {
    const label = patch.label.trim()
    if (!label) {
      throw Object.assign(new Error('Label required'), { statusCode: 400 })
    }
    const clash = store
      .listPhysicalRooms(networkId, propertyId)
      .find((r) => r.id !== roomId && r.label === label)
    if (clash) {
      throw Object.assign(new Error('Room label already used on this property'), {
        statusCode: 400,
      })
    }
    room.label = label
  }
  if (patch.sortOrder !== undefined) {
    room.sortOrder = patch.sortOrder
  }
  return { ...room }
}
