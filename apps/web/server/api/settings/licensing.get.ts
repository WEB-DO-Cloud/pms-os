import { billingSnapshot } from '@pms/licensing'
import { principalCanPerformAction } from '@pms/auth'
import { requirePrincipal } from '../../utils/auth'
import { parseNetworkId } from '../../utils/integrations'
import { whiteLabelUiState } from '../../utils/branding'

/** GET /api/settings/licensing — community vs commercial entitlement snapshot. */
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const networkId = parseNetworkId(q.networkId)
  const { principal } = await requirePrincipal(event, networkId)

  if (!principalCanPerformAction(principal, 'licensing')) {
    throw createError({ statusCode: 403, statusMessage: 'Licensing settings denied' })
  }

  return {
    networkId,
    billing: billingSnapshot(principal.entitlements),
    whiteLabel: await whiteLabelUiState(principal.entitlements, networkId),
  }
})
