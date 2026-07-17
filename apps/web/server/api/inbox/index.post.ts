import { principalCanAccessProperty } from '@pms/auth'
import { requirePrincipal } from '../../utils/auth'
import { parseNetworkId } from '../../utils/integrations'
import { requireOpsModule, runOpsCommand } from '../../utils/operations'

/** POST /api/inbox — queueGuestMessage via runCommand */
export default defineEventHandler(async (event) => {
  const body = await readBody<{
    networkId: number
    reservationId: number
    propertyId: number
    body: string
    channel?: string
  }>(event)
  const networkId = parseNetworkId(body.networkId)
  const { principal } = await requirePrincipal(event, networkId)
  requireOpsModule(principal, 'inbox')

  if (!principalCanAccessProperty(principal, body.propertyId)) {
    throw createError({ statusCode: 403, statusMessage: 'Property out of scope' })
  }
  if (!body.body?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Message body required' })
  }

  const result = await runOpsCommand(
    'queueGuestMessage',
    principal,
    body.propertyId,
    {
      reservationId: body.reservationId,
      propertyId: body.propertyId,
      body: body.body.trim(),
      channel: body.channel ?? 'channex',
    },
  )
  return { message: result.data }
})
