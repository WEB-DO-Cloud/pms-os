import type { ChannexRoomTypeAttrs } from '../channex/types'

export type RoomTypeUpsertInput = {
  networkId: number
  propertyId: number
  channexId: string
  name: string
  capacity: number | null
  countOfRooms: number | null
  channexRaw: unknown
  sourceUpdatedAt?: string | null
}

export function mapChannexRoomType(
  networkId: number,
  propertyId: number,
  channexId: string,
  attrs: ChannexRoomTypeAttrs,
  raw: unknown,
): RoomTypeUpsertInput {
  const adults = attrs.occ_adults ?? 2
  return {
    networkId,
    propertyId,
    channexId,
    name: attrs.title?.trim() || `Room ${channexId}`,
    capacity: adults,
    countOfRooms: attrs.count_of_rooms ?? 1,
    channexRaw: raw,
    sourceUpdatedAt: attrs.updated_at ?? null,
  }
}
