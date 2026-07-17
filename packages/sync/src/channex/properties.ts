import type { ChannexClient } from './client'
import { mapChannexProperty } from '../mappers/property'
import type { SyncStore } from '../store'

export type ImportPropertiesResult = {
  imported: number
  updated: number
}

export async function importProperties(
  store: SyncStore,
  client: ChannexClient,
  networkId: number,
  /** When set, only these Channex property IDs are imported (tenant scoping). */
  channexIds?: readonly string[],
): Promise<ImportPropertiesResult> {
  // Empty allowlist means "scoped to nothing" — never fall through to importing all.
  if (channexIds && channexIds.length === 0) return { imported: 0, updated: 0 }
  let imported = 0
  let updated = 0
  let page = 1
  for (;;) {
    const res = await client.listProperties(page, channexIds ? { ids: channexIds } : undefined)
    if (!res.data?.length) break
    for (const item of res.data) {
      const mapped = mapChannexProperty(networkId, item.id, item.attributes, item)
      const existing = store.findPropertyByChannexId(networkId, item.id)
      store.upsertProperty({
        ...mapped,
        timezone: mapped.timezone ?? null,
        currency: mapped.currency ?? null,
        address: mapped.address ?? null,
        city: mapped.city ?? null,
        country: mapped.country ?? null,
        channexTitle: mapped.channexTitle ?? null,
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
