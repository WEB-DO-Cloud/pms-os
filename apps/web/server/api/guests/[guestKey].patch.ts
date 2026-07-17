import { principalCanAccessProperty } from '@pms/auth'
import { requirePrincipal } from '../../utils/auth'
import { parseNetworkId } from '../../utils/integrations'
import { requireOpsModule, runOpsCommand } from '../../utils/operations'

/** PATCH /api/guests/:guestKey — updateGuestEnrichment */
export default defineEventHandler(async (event) => {
  const guestKey = decodeURIComponent(getRouterParam(event, 'guestKey') ?? '')
  const body = await readBody<{
    networkId: number
    propertyId: number
    displayName?: string
    email?: string | null
    notes?: string | null
    vip?: boolean
  }>(event)
  const networkId = parseNetworkId(body.networkId)
  const { principal } = await requirePrincipal(event, networkId)
  requireOpsModule(principal, 'guests')

  if (!principalCanAccessProperty(principal, body.propertyId)) {
    throw createError({ statusCode: 403, statusMessage: 'Property out of scope' })
  }

  const result = await runOpsCommand(
    'updateGuestEnrichment',
    principal,
    body.propertyId,
    {
      guestKey,
      propertyId: body.propertyId,
      displayName: body.displayName,
      email: body.email,
      notes: body.notes,
      vip: body.vip,
    },
  )
  return { guest: result.data }
})
