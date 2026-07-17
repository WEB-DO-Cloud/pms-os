import { parseNetworkId } from '../../../utils/integrations'
import {
  createCheckoutSession,
  requireBillingAccess,
} from '../../../utils/billing'

/** POST /api/settings/billing/checkout — start Stripe Checkout for the network. */
export default defineEventHandler(async (event) => {
  const body = (await readBody(event).catch(() => ({}))) as { networkId?: number }
  const networkId = parseNetworkId(body.networkId)
  const { session } = await requireBillingAccess(event, networkId)
  return createCheckoutSession({
    networkId,
    email: session.user.email,
  })
})
