import type { CommandDefinition, ReviewRecord, ReviewStatus } from '../store'

export type LocalReviewSeed = {
  propertyId: number
  reservationId?: number | null
  guestName?: string | null
  rating?: number | null
  title?: string | null
  comment?: string | null
  source?: string
  status?: ReviewStatus
  createdAt?: string
}

export type ImportLocalReviewsInput = {
  /** Scope gate — caller must pick a property in principal scope. */
  propertyId: number
  reviews: LocalReviewSeed[]
}

/**
 * Stub Channex review sync: loads local/fixture rows into DomainStore.
 * Does not write back to channels.
 */
export const importLocalReviews: CommandDefinition<
  ImportLocalReviewsInput,
  { imported: number; reviews: ReviewRecord[] }
> = {
  name: 'importLocalReviews',
  module: 'reviews',
  allowedActorKinds: ['user', 'sync'],
  risk: 'low',
  requiresApproval: false,
  supportsDryRun: true,
  needsExternalSyncRecovery: false,
  compensatingAction: 'none',
  resolvePropertyId: (input) => input.propertyId,
  async execute(ctx, input, { store }) {
    const created: ReviewRecord[] = []
    for (const seed of input.reviews) {
      if (seed.propertyId !== input.propertyId) continue
      const row: ReviewRecord = {
        id: store.nextId('review'),
        networkId: ctx.networkId,
        propertyId: seed.propertyId,
        reservationId: seed.reservationId ?? null,
        guestName: seed.guestName ?? null,
        rating: seed.rating ?? null,
        title: seed.title ?? null,
        comment: seed.comment ?? null,
        source: seed.source ?? 'fixture',
        status: seed.status ?? 'pending',
        responseTemplate: null,
        respondedAt: null,
        createdAt: seed.createdAt ?? new Date().toISOString(),
      }
      store.reviews.push(row)
      created.push(row)
    }
    return {
      data: { imported: created.length, reviews: created },
      resourceType: 'review_batch',
      resourceId: String(input.propertyId),
    }
  },
}
