import { requirePrincipal } from '../../utils/auth'
import { parseNetworkId } from '../../utils/integrations'
import {
  requireOpsModule,
} from '../../utils/operations'
import {
  getDomainStore,
  listScopedProperties,
} from '../../utils/reservations'
import {
  filterMessagesForPrincipal,
} from '@pms/domain'

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
  const messages = filterMessagesForPrincipal(store.outboundMessages, principal, {
    propertyId: Number.isFinite(propertyId) ? propertyId : undefined,
    reservationId: Number.isFinite(reservationId) ? reservationId : undefined,
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  const reservations = store.reservations
    .filter((r) =>
      listScopedProperties(networkId, principal).some((p) => p.id === r.propertyId),
    )
    .map((r) => ({
      id: r.id,
      propertyId: r.propertyId,
      guestName: r.guestName,
      status: r.status,
    }))

  return {
    networkId,
    properties: listScopedProperties(networkId, principal).map((p) => ({
      id: p.id,
      name: p.name,
    })),
    reservations,
    messages,
  }
})
