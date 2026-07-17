import { parseNetworkId, requireIntegrationsAccess } from '../../utils/integrations'
import { getSyncStore, runInternalImport } from '../../utils/sync'

/** POST /api/channex/import — import properties + room types from Channex */
export default defineEventHandler(async (event) => {
  const body = (await readBody(event).catch(() => ({}))) as { networkId?: number }
  const networkId = parseNetworkId(body.networkId)
  const { principal } = await requireIntegrationsAccess(event, networkId)
  if (principal.networkId !== networkId) {
    throw createError({ statusCode: 403, statusMessage: 'Network mismatch' })
  }

  const result = await runInternalImport(networkId)
  const store = getSyncStore(networkId)
  const catalog = store.listProperties(networkId).map((p) => ({
    id: p.id,
    channexId: p.channexId,
    name: p.name,
    lastSyncedAt: p.lastSyncedAt,
  }))

  if ('skipped' in result) {
    return { skipped: true as const, catalog }
  }

  return {
    properties: result.properties,
    roomTypes: result.roomTypes,
    catalog,
  }
})
