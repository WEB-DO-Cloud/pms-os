import { principalCanAccessProperty } from '@pms/auth'
import { requirePrincipal } from '../../utils/auth'
import { parseNetworkId } from '../../utils/integrations'
import { requireOpsModule } from '../../utils/operations'
import { getDomainStore } from '../../utils/reservations'

/** POST /api/inbox/read — mark one scoped conversation read for this user. */
export default defineEventHandler(async (event) => {
  const body = await readBody<{
    networkId: number
    conversationKey: string
    propertyId: number
  }>(event)
  const networkId = parseNetworkId(body.networkId)
  const { principal } = await requirePrincipal(event, networkId)
  requireOpsModule(principal, 'inbox')

  if (!principalCanAccessProperty(principal, body.propertyId)) {
    throw createError({ statusCode: 403, statusMessage: 'Property out of scope' })
  }
  if (!/^[tr]:[^:]+$/.test(body.conversationKey ?? '')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid conversation key' })
  }

  const store = getDomainStore(networkId)
  const belongsToProperty = body.conversationKey.startsWith('t:')
    ? store.channelMessages.some(
        (message) =>
          message.networkId === networkId &&
          message.propertyId === body.propertyId &&
          `t:${message.channexThreadId}` === body.conversationKey,
      )
    : store.reservations.some(
        (reservation) =>
          reservation.networkId === networkId &&
          reservation.propertyId === body.propertyId &&
          `r:${reservation.id}` === body.conversationKey,
      )
  if (!belongsToProperty) {
    throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
  }

  const lastReadAt = new Date().toISOString()
  const existing = store.conversationReads.find(
    (read) =>
      read.networkId === networkId &&
      read.userId === principal.userId &&
      read.conversationKey === body.conversationKey,
  )
  if (existing) existing.lastReadAt = lastReadAt
  else {
    store.conversationReads.push({
      networkId,
      userId: principal.userId,
      conversationKey: body.conversationKey,
      lastReadAt,
    })
  }
  return { conversationKey: body.conversationKey, lastReadAt }
})
