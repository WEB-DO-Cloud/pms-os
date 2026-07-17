import { parseNetworkId } from '../../../utils/integrations'
import {
  createPortalSession,
  requireBillingAccess,
} from '../../../utils/billing'

/** POST /api/settings/billing/portal — open Stripe Billing Portal. */
export default defineEventHandler(async (event) => {
  const body = (await readBody(event).catch(() => ({}))) as { networkId?: number }
  const networkId = parseNetworkId(body.networkId)
  await requireBillingAccess(event, networkId)
  return createPortalSession(networkId)
})
