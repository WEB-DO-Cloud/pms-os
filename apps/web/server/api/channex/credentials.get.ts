import {
  getCredentialStatus,
  parseNetworkId,
  requireIntegrationsAccess,
} from '../../utils/integrations'

/** GET /api/channex/credentials?networkId= — masked credential status (never plaintext) */
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const networkId = parseNetworkId(q.networkId)
  const { principal } = await requireIntegrationsAccess(event, networkId)
  if (principal.networkId !== networkId) {
    throw createError({ statusCode: 403, statusMessage: 'Network mismatch' })
  }
  return getCredentialStatus(networkId)
})
