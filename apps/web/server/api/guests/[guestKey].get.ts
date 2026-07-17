import { requirePrincipal } from '../../utils/auth'
import { parseNetworkId } from '../../utils/integrations'
import {
  requireOpsModule,
} from '../../utils/operations'
import {
  getDomainStore,
} from '../../utils/reservations'
import {
  filterMessagesForPrincipal,
  projectGuestsForPrincipal,
} from '@pms/domain'

/** GET /api/guests/:guestKey?networkId= */
export default defineEventHandler(async (event) => {
  const guestKey = decodeURIComponent(getRouterParam(event, 'guestKey') ?? '')
    .trim()
    .toLowerCase()
  const q = getQuery(event)
  const networkId = parseNetworkId(q.networkId)
  const { principal } = await requirePrincipal(event, networkId)
  requireOpsModule(principal, 'guests')

  const store = getDomainStore(networkId)
  const guests = projectGuestsForPrincipal(
    store.reservations,
    store.guests,
    principal,
  )
  const guest = guests.find((g) => g.guestKey === guestKey)
  if (!guest) {
    throw createError({ statusCode: 404, statusMessage: 'Guest not found' })
  }

  const reservations = store.reservations.filter((r) =>
    guest.reservationIds.includes(r.id),
  )
  const messages = filterMessagesForPrincipal(
    store.outboundMessages,
    principal,
  ).filter((m) => guest.reservationIds.includes(m.reservationId))

  return { networkId, guest, reservations, messages }
})
