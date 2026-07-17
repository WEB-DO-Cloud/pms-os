import { parseNetworkId, requireIntegrationsAccess } from '../../utils/integrations'
import { runRetryDeadLetters } from '../../utils/sync'

/** POST /api/sync/retry-dead-letters — re-apply dead letters + requeue failed acks */
export default defineEventHandler(async (event) => {
  const body = (await readBody(event).catch(() => ({}))) as { networkId?: number }
  const networkId = parseNetworkId(body.networkId)
  const { principal } = await requireIntegrationsAccess(event, networkId)
  if (principal.networkId !== networkId) {
    throw createError({ statusCode: 403, statusMessage: 'Network mismatch' })
  }
  return runRetryDeadLetters(networkId)
})
