import { requirePrincipal } from '../../utils/auth'
import { parseNetworkId } from '../../utils/integrations'
import {
  requireOpsModule,
} from '../../utils/operations'
import {
  getDomainStore,
} from '../../utils/reservations'
import {
  filterReviewsForPrincipal,
} from '@pms/domain'

/** GET /api/reviews/:id?networkId= */
export default defineEventHandler(async (event) => {
  const reviewId = Number(getRouterParam(event, 'id'))
  const q = getQuery(event)
  const networkId = parseNetworkId(q.networkId)
  const { principal } = await requirePrincipal(event, networkId)
  requireOpsModule(principal, 'reviews')

  if (!Number.isFinite(reviewId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid review id' })
  }

  const store = getDomainStore(networkId)
  const review = filterReviewsForPrincipal(store.reviews, principal).find(
    (r) => r.id === reviewId,
  )
  if (!review) {
    throw createError({ statusCode: 404, statusMessage: 'Review not found' })
  }
  return { networkId, review }
})
