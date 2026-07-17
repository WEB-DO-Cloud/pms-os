import { requirePrincipal } from '../../utils/auth'
import { parseNetworkId } from '../../utils/integrations'
import {
  findReservationInScope,
  getDomainStore,
  requireReservationsModule,
  reservationDetailPayload,
} from '../../utils/reservations'

/** GET /api/reservations/:id */
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id) || id < 1) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }
  const q = getQuery(event)
  const networkId = parseNetworkId(q.networkId)
  const { principal } = await requirePrincipal(event, networkId)
  if (principal.networkId !== networkId) {
    throw createError({ statusCode: 403, statusMessage: 'Network mismatch' })
  }
  requireReservationsModule(principal)

  const store = getDomainStore(networkId)
  const reservation = findReservationInScope(store, principal, id)
  if (!reservation) {
    throw createError({ statusCode: 404, statusMessage: 'Reservation not found' })
  }
  return reservationDetailPayload(store, reservation)
})
