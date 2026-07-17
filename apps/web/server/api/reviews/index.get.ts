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
  filterReviewsForPrincipal,
} from '@pms/domain'

/** GET /api/reviews?networkId=&propertyId=&status= */
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const networkId = parseNetworkId(q.networkId)
  const { principal } = await requirePrincipal(event, networkId)
  requireOpsModule(principal, 'reviews')

  const propertyId =
    q.propertyId != null && q.propertyId !== ''
      ? Number(q.propertyId)
      : undefined

  const store = getDomainStore(networkId)
  const reviews = filterReviewsForPrincipal(store.reviews, principal, {
    propertyId: Number.isFinite(propertyId) ? propertyId : undefined,
    status: typeof q.status === 'string' ? q.status : undefined,
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  const ratings = reviews
    .map((r) => r.rating)
    .filter((n): n is number => typeof n === 'number')
  const analytics = {
    count: reviews.length,
    pending: reviews.filter((r) => r.status === 'pending').length,
    avgRating:
      ratings.length === 0
        ? null
        : Math.round(
            (ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10,
          ) / 10,
  }

  return {
    networkId,
    properties: listScopedProperties(networkId, principal).map((p) => ({
      id: p.id,
      name: p.name,
    })),
    reviews,
    analytics,
  }
})
