import { requirePrincipal } from '../../utils/auth'
import { parseNetworkId } from '../../utils/integrations'
import { requireOpsModule } from '../../utils/operations'
import {
  getDomainStore,
  listScopedProperties,
} from '../../utils/reservations'
import { filterMessagesForPrincipal } from '@pms/domain'
import {
  reservationStatusLine,
  toInboxReservation,
  unreadGuestCount,
} from '../../lib/inbox'

/** GET /api/inbox?networkId=&propertyId=&reservationId= — outbound message queue */
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const networkId = parseNetworkId(q.networkId)
  const { principal } = await requirePrincipal(event, networkId)
  requireOpsModule(principal, 'inbox')

  const propertyId =
    q.propertyId != null && q.propertyId !== ''
      ? Number(q.propertyId)
      : undefined
  const reservationId =
    q.reservationId != null && q.reservationId !== ''
      ? Number(q.reservationId)
      : undefined

  const store = getDomainStore(networkId)
  const scope = {
    propertyId: Number.isFinite(propertyId) ? propertyId : undefined,
    reservationId: Number.isFinite(reservationId) ? reservationId : undefined,
  }
  const messages = filterMessagesForPrincipal(store.outboundMessages, principal, scope)
  const channelMessages = filterMessagesForPrincipal(store.channelMessages, principal, scope)

  const properties = listScopedProperties(networkId, principal)
  const propertyNames = new Map(properties.map((property) => [property.id, property.name]))
  const reservations = store.reservations
    .filter((reservation) => propertyNames.has(reservation.propertyId))
    .map((reservation) => {
      const view = toInboxReservation(
        reservation,
        propertyNames.get(reservation.propertyId) ?? `Property ${reservation.propertyId}`,
      )
      return { ...view, statusLine: reservationStatusLine(view) }
    })
  const reads = store.conversationReads
    .filter((read) => read.networkId === networkId && read.userId === principal.userId)
    .map(({ conversationKey, lastReadAt }) => ({ conversationKey, lastReadAt }))
  const readByConversation = new Map(
    reads.map((read) => [read.conversationKey, read.lastReadAt]),
  )
  const messagesByConversation = new Map<
    string,
    { sender: string; receivedAt: string }[]
  >()
  for (const message of channelMessages) {
    const key = `t:${message.channexThreadId}`
    const rows = messagesByConversation.get(key) ?? []
    rows.push(message)
    messagesByConversation.set(key, rows)
  }
  const unreadCount = [...messagesByConversation].reduce(
    (total, [key, rows]) =>
      total + unreadGuestCount(rows, readByConversation.get(key) ?? null),
    0,
  )

  return {
    reservations,
    messages,
    channelMessages,
    reads,
    unreadCount,
  }
})
