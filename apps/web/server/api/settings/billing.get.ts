import { parseNetworkId } from '../../utils/integrations'
import {
  getBillingOverview,
  requireBillingAccess,
} from '../../utils/billing'

/** GET /api/settings/billing?networkId= — subscription overview + estimate. */
export default defineEventHandler(async (event) => {
  const networkId = parseNetworkId(getQuery(event).networkId)
  await requireBillingAccess(event, networkId)
  return getBillingOverview(networkId)
})
