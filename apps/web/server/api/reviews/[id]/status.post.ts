import { principalCanAccessProperty } from '@pms/auth'
import type { ReviewStatus } from '@pms/domain'
import { requirePrincipal } from '../../../utils/auth'
import { parseNetworkId } from '../../../utils/integrations'
import { requireOpsModule, runOpsCommand } from '../../../utils/operations'

/** POST /api/reviews/:id/status — template response / triage */
export default defineEventHandler(async (event) => {
  const reviewId = Number(getRouterParam(event, 'id'))
  const body = await readBody<{
    networkId: number
    propertyId: number
    status: ReviewStatus
    responseTemplate?: string | null
  }>(event)
  const networkId = parseNetworkId(body.networkId)
  const { principal } = await requirePrincipal(event, networkId)
  requireOpsModule(principal, 'reviews')

  if (!Number.isFinite(reviewId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid review id' })
  }
  if (!principalCanAccessProperty(principal, body.propertyId)) {
    throw createError({ statusCode: 403, statusMessage: 'Property out of scope' })
  }

  const result = await runOpsCommand(
    'updateReviewStatus',
    principal,
    body.propertyId,
    {
      reviewId,
      propertyId: body.propertyId,
      status: body.status,
      responseTemplate: body.responseTemplate,
    },
  )
  return { review: result.data }
})
