import type { ChannexClient } from './client'
import { mapChannexRoomType } from '../mappers/room-type'
import type { SyncStore } from '../store'

export type ImportRoomTypesResult = {
  imported: number
  updated: number
}

export async function importRoomTypesForProperty(
  store: SyncStore,
  client: ChannexClient,
  networkId: number,
  propertyChannexId: string,
  localPropertyId: number,
): Promise<ImportRoomTypesResult> {
  let imported = 0
  let updated = 0
  let page = 1
  for (;;) {
    const res = await client.listRoomTypes(propertyChannexId, page)
    if (!res.data?.length) break
    for (const item of res.data) {
      const mapped = mapChannexRoomType(
        networkId,
        localPropertyId,
        item.id,
        item.attributes,
        item,
      )
      const existing = store.findRoomTypeByChannexId(networkId, item.id)
      store.upsertRoomType({
        ...mapped,
        sourceUpdatedAt: mapped.sourceUpdatedAt ?? null,
      })
      if (existing) updated++
      else imported++
    }
    if (!res.meta?.total || res.data.length < 100) break
    page++
  }
  return { imported, updated }
}

export async function importAllRoomTypes(
  store: SyncStore,
  client: ChannexClient,
  networkId: number,
): Promise<ImportRoomTypesResult> {
  let imported = 0
  let updated = 0
  for (const prop of store.listProperties(networkId)) {
    const result = await importRoomTypesForProperty(
      store,
      client,
      networkId,
      prop.channexId,
      prop.id,
    )
    imported += result.imported
    updated += result.updated
  }
  return { imported, updated }
}
