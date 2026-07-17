import { canAccessOwnerPortal, ownerPortalPayload } from '../../utils/owner'
import { requirePrincipal } from '../../utils/auth'
import { parseNetworkId } from '../../utils/integrations'

/** GET /api/owner — owner-scoped portfolio, bookings, occupancy/revenue summary. */
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const networkId = parseNetworkId(q.networkId)
  const { principal } = await requirePrincipal(event, networkId)

  if (!canAccessOwnerPortal(principal)) {
    throw createError({ statusCode: 403, statusMessage: 'Owner portal denied' })
  }

  const from = typeof q.from === 'string' ? q.from : defaultFrom()
  const to = typeof q.to === 'string' ? q.to : defaultTo()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'from and to required as YYYY-MM-DD',
    })
  }

  const propertyId =
    q.propertyId != null && q.propertyId !== ''
      ? Number(q.propertyId)
      : undefined
  if (propertyId != null && !Number.isFinite(propertyId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid propertyId' })
  }

  return ownerPortalPayload(networkId, principal, { from, to, propertyId })
})

function defaultFrom() {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

function defaultTo() {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}
