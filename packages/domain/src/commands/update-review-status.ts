import type { CommandDefinition, ReviewRecord, ReviewStatus } from '../store'

export type UpdateReviewStatusInput = {
  reviewId: number
  propertyId: number
  status: ReviewStatus
  responseTemplate?: string | null
}

export const updateReviewStatus: CommandDefinition<
  UpdateReviewStatusInput,
  ReviewRecord
> = {
  name: 'updateReviewStatus',
  module: 'reviews',
  allowedActorKinds: ['user'],
  risk: 'low',
  requiresApproval: false,
  supportsDryRun: true,
  needsExternalSyncRecovery: false,
  compensatingAction: 'none',
  resolvePropertyId: (input) => input.propertyId,
  async execute(ctx, input, { store }) {
    const review = store.reviews.find(
      (r) =>
        r.id === input.reviewId &&
        r.networkId === ctx.networkId &&
        r.propertyId === input.propertyId,
    )
    if (!review) {
      throw Object.assign(new Error('Review not found in scope'), {
        code: 'NOT_FOUND',
      })
    }
    review.status = input.status
    if (input.responseTemplate !== undefined) {
      review.responseTemplate = input.responseTemplate
    }
    review.respondedAt =
      input.status === 'responded' ? new Date().toISOString() : null
    return {
      data: { ...review },
      resourceType: 'review',
      resourceId: String(review.id),
    }
  },
}
