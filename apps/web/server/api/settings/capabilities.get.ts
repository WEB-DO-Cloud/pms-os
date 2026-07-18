import { getNetworkCapabilities } from '@pms/domain'
import { requirePrincipal } from '../../utils/auth'
import { parseNetworkId } from '../../utils/integrations'
import { getDomainStore } from '../../utils/reservations'
import { ensureSecretsHydrated } from '../../utils/sync'

/** GET /api/settings/capabilities — per-network external write gates (read for any staff). */
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const networkId = parseNetworkId(q.networkId)
  const { principal } = await requirePrincipal(event, networkId)
  if (principal.role === 'property_owner') {
    throw createError({ statusCode: 403, statusMessage: 'Staff only' })
  }
  await ensureSecretsHydrated(networkId)
  return {
    networkId,
    capabilities: getNetworkCapabilities(getDomainStore(networkId), networkId),
  }
})
