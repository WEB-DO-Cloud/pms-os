/**
 * Reconcile PMS-owned physical rooms against a room type's count_of_rooms.
 * Grows missing slots; archives highest unassigned slots on shrink; never
 * overwrites edited labels or regenerates existing slot IDs.
 */
export type PhysicalRoomSeed = {
  id: number
  networkId: number
  propertyId: number
  roomTypeId: number
  slotIndex: number
  label: string
  sortOrder: number
  archivedAt: string | null
}

export type ReconcileRoomType = {
  id: number
  networkId: number
  propertyId: number
  countOfRooms: number | null
}

export type ReconcileResult = {
  /** Full set of rooms for this room type after reconcile (active + archived extras). */
  rooms: PhysicalRoomSeed[]
  createdIds: number[]
  archivedIds: number[]
  restoredIds: number[]
}

function defaultLabel(slotIndex: number) {
  return String(slotIndex)
}

/**
 * Pure reconcile. `nextId` supplies ids for newly created rooms.
 * `assignedRoomIds` are rooms currently holding a live reservation — never archive those.
 */
export function reconcilePhysicalRooms(
  roomType: ReconcileRoomType,
  existingForType: readonly PhysicalRoomSeed[],
  assignedRoomIds: ReadonlySet<number>,
  nextId: () => number,
  nowIso = new Date().toISOString(),
): ReconcileResult {
  const target = Math.max(0, roomType.countOfRooms ?? 1)
  const bySlot = new Map(existingForType.map((r) => [r.slotIndex, r] as const))
  const createdIds: number[] = []
  const archivedIds: number[] = []
  const restoredIds: number[] = []
  const rooms: PhysicalRoomSeed[] = []

  for (let slot = 1; slot <= target; slot++) {
    const row = bySlot.get(slot)
    if (row) {
      if (row.archivedAt) {
        restoredIds.push(row.id)
        rooms.push({ ...row, archivedAt: null })
      } else {
        rooms.push(row)
      }
      bySlot.delete(slot)
    } else {
      const id = nextId()
      createdIds.push(id)
      rooms.push({
        id,
        networkId: roomType.networkId,
        propertyId: roomType.propertyId,
        roomTypeId: roomType.id,
        slotIndex: slot,
        label: defaultLabel(slot),
        sortOrder: slot,
        archivedAt: null,
      })
    }
  }

  // Remaining slots above target: archive highest unassigned first.
  const extras = [...bySlot.values()].sort((a, b) => b.slotIndex - a.slotIndex)
  for (const row of extras) {
    if (assignedRoomIds.has(row.id)) {
      if (row.archivedAt) {
        restoredIds.push(row.id)
        rooms.push({ ...row, archivedAt: null })
      } else {
        rooms.push(row)
      }
      continue
    }
    if (!row.archivedAt) {
      archivedIds.push(row.id)
      rooms.push({ ...row, archivedAt: nowIso })
    } else {
      rooms.push(row)
    }
  }

  return { rooms, createdIds, archivedIds, restoredIds }
}
