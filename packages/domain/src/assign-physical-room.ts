/**
 * Deterministic physical-room assignment for hotel inventory.
 * Half-open stay windows: occupied when existing.checkIn < new.checkOut
 * and new.checkIn < existing.checkOut.
 */

export type AssignableRoom = {
  id: number
  roomTypeId: number
  sortOrder: number
  archivedAt: string | null
}

export type AssignableStay = {
  id: number
  roomId?: number | null
  roomTypeId?: number | null
  checkInDate: string
  checkOutDate: string
  status: string
}

export function staysOverlap(
  a: { checkInDate: string; checkOutDate: string },
  b: { checkInDate: string; checkOutDate: string },
): boolean {
  return a.checkInDate < b.checkOutDate && b.checkInDate < a.checkOutDate
}

function isLiveStay(status: string): boolean {
  return status !== 'cancelled' && status !== 'no_show'
}

/**
 * Pick a room for `stay` among `rooms` of the stay's room type.
 * Keeps current room when still valid; otherwise first free by sortOrder then id.
 * Returns null when capacity is full or no room type / no active rooms.
 */
export function assignPhysicalRoom(
  stay: AssignableStay,
  rooms: readonly AssignableRoom[],
  occupied: readonly AssignableStay[],
): number | null {
  if (stay.roomTypeId == null) return null
  if (!isLiveStay(stay.status)) return null

  const candidates = rooms
    .filter((r) => r.roomTypeId === stay.roomTypeId && !r.archivedAt)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)

  if (!candidates.length) return null

  const blockers = occupied.filter(
    (o) =>
      o.id !== stay.id &&
      isLiveStay(o.status) &&
      o.roomId != null &&
      staysOverlap(stay, o),
  )
  const taken = new Set(blockers.map((o) => o.roomId!))

  if (stay.roomId != null && !taken.has(stay.roomId)) {
    const stillValid = candidates.some((c) => c.id === stay.roomId)
    if (stillValid) return stay.roomId
  }

  const free = candidates.find((c) => !taken.has(c.id))
  return free?.id ?? null
}
