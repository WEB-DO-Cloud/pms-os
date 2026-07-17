import { requirePrincipal } from '../../utils/auth'
import { parseNetworkId } from '../../utils/integrations'
import { ratesPayload } from '../../utils/revenue'

/** GET /api/rates?networkId= — read-only Channex-managed ARI cache */
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const networkId = parseNetworkId(q.networkId)
  const { principal } = await requirePrincipal(event, networkId)
  return {
    networkId,
    ...ratesPayload(networkId, principal),
  }
})
