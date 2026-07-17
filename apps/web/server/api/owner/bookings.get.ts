import { canAccessOwnerPortal, ownerBookingsPayload } from '../../utils/owner'
import { requirePrincipal } from '../../utils/auth'
import { parseNetworkId } from '../../utils/integrations'

/** GET /api/owner/bookings — allowlisted owner booking rows only. */
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const networkId = parseNetworkId(q.networkId)
  const { principal } = await requirePrincipal(event, networkId)

  if (!canAccessOwnerPortal(principal)) {
    throw createError({ statusCode: 403, statusMessage: 'Owner portal denied' })
  }

  const propertyId =
    q.propertyId != null && q.propertyId !== ''
      ? Number(q.propertyId)
      : undefined
  if (propertyId != null && !Number.isFinite(propertyId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid propertyId' })
  }

  return {
    networkId,
    bookings: ownerBookingsPayload(networkId, principal, { propertyId }),
    readOnly: true,
  }
})
