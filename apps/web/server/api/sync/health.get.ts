import { parseNetworkId, requireIntegrationsAccess } from '../../utils/integrations'
import { publicSyncHealth } from '../../utils/sync'

/** GET /api/sync/health?networkId= — safe sync health for integrations UI */
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const networkId = parseNetworkId(q.networkId)
  const { principal } = await requireIntegrationsAccess(event, networkId)
  if (principal.networkId !== networkId) {
    throw createError({ statusCode: 403, statusMessage: 'Network mismatch' })
  }
  const detail = getHeader(event, 'x-sync-include-errors') === '1'
  return publicSyncHealth(networkId, detail)
})
