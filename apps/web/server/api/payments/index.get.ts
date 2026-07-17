import { requirePrincipal } from '../../utils/auth'
import { parseNetworkId } from '../../utils/integrations'
import { paymentsListPayload } from '../../utils/revenue'

/** GET /api/payments?networkId=&propertyId=&reservationId= */
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const networkId = parseNetworkId(q.networkId)
  const { principal } = await requirePrincipal(event, networkId)

  const propertyId =
    q.propertyId != null && q.propertyId !== ''
      ? Number(q.propertyId)
      : undefined
  const reservationId =
    q.reservationId != null && q.reservationId !== ''
      ? Number(q.reservationId)
      : undefined

  return paymentsListPayload(networkId, principal, {
    propertyId: Number.isFinite(propertyId) ? propertyId : undefined,
    reservationId: Number.isFinite(reservationId) ? reservationId : undefined,
  })
})
