import { requirePrincipal } from '../../../../utils/auth'
import { parseNetworkId } from '../../../../utils/integrations'
import { approveHeldAction } from '../../../../utils/automation'

/** POST /api/automation/approvals/:id/approve */
export default defineEventHandler(async (event) => {
  const approvalId = getRouterParam(event, 'id')
  if (!approvalId) {
    throw createError({ statusCode: 400, statusMessage: 'Approval id required' })
  }
  const body = await readBody<{ networkId: number; propertyId?: number }>(event)
  const networkId = parseNetworkId(body.networkId)
  const { principal } = await requirePrincipal(event, networkId)
  return approveHeldAction(principal, approvalId, body.propertyId)
})
