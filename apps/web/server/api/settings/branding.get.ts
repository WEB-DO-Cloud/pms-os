import { principalCanPerformAction } from '@pms/auth'
import { requirePrincipal } from '../../utils/auth'
import { parseNetworkId } from '../../utils/integrations'
import { whiteLabelUiState } from '../../utils/branding'

/** GET /api/settings/branding */
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const networkId = parseNetworkId(q.networkId)
  const { principal } = await requirePrincipal(event, networkId)

  if (
    !principalCanPerformAction(principal, 'licensing') &&
    principal.role !== 'manager'
  ) {
    throw createError({ statusCode: 403, statusMessage: 'Branding settings denied' })
  }

  return await whiteLabelUiState(principal.entitlements, networkId)
})
