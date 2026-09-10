export const COLLECTION_TYPES = [
  'percent',
  'fixed',
  'full',
  'pay_at_hotel',
] as const

export type CollectionType = (typeof COLLECTION_TYPES)[number]

export type LiveCollectionPolicy = {
  propertyId: number
  collectionType: CollectionType
  /** 1–100 when collectionType is percent. */
  percent: number | null
  fixedAmountMinor: number | null
  termsText: string
  stripeConnectAccountId: string | null
  stripeChargesEnabled: boolean
  updatedAt: string
}

/** Immutable copy written onto the reservation at book time (KTD8). */
export type PaymentTermsSnapshot = {
  collectionType: CollectionType
  percent: number | null
  fixedAmountMinor: number | null
  termsText: string
  stayTotalMinor: number
  depositMinor: number
  currency: string
  snapshottedAt: string
}

export function isCollectionType(value: unknown): value is CollectionType {
  return (
    typeof value === 'string' &&
    (COLLECTION_TYPES as readonly string[]).includes(value)
  )
}

export function isCollectNow(type: CollectionType): boolean {
  return type !== 'pay_at_hotel'
}

export function collectNowNeedsCharges(policy: LiveCollectionPolicy): boolean {
  return isCollectNow(policy.collectionType) && !policy.stripeChargesEnabled
}

export function computeDepositMinor(
  policy: Pick<
    LiveCollectionPolicy,
    'collectionType' | 'percent' | 'fixedAmountMinor'
  >,
  stayTotalMinor: number,
): number {
  if (!Number.isFinite(stayTotalMinor) || stayTotalMinor < 0) {
    throw { code: 'VALIDATION', message: 'stayTotalMinor must be >= 0' }
  }
  switch (policy.collectionType) {
    case 'pay_at_hotel':
      return 0
    case 'full':
      return stayTotalMinor
    case 'percent': {
      const pct = policy.percent
      if (pct == null || !Number.isFinite(pct) || pct < 1 || pct > 100) {
        throw { code: 'VALIDATION', message: 'percent must be 1–100' }
      }
      return Math.round((stayTotalMinor * pct) / 100)
    }
    case 'fixed': {
      const fixed = policy.fixedAmountMinor
      if (fixed == null || !Number.isFinite(fixed) || fixed < 0) {
        throw { code: 'VALIDATION', message: 'fixedAmountMinor must be >= 0' }
      }
      return Math.min(fixed, stayTotalMinor)
    }
  }
}

export function snapshotPaymentTerms(
  policy: LiveCollectionPolicy,
  stayTotalMinor: number,
  currency: string,
  now = new Date(),
): PaymentTermsSnapshot {
  return {
    collectionType: policy.collectionType,
    percent: policy.percent,
    fixedAmountMinor: policy.fixedAmountMinor,
    termsText: policy.termsText,
    stayTotalMinor,
    depositMinor: computeDepositMinor(policy, stayTotalMinor),
    currency,
    snapshottedAt: now.toISOString(),
  }
}

export function assertLivePolicyShape(policy: LiveCollectionPolicy): void {
  if (!isCollectionType(policy.collectionType)) {
    throw { code: 'VALIDATION', message: 'Unknown collection type' }
  }
  if (!policy.termsText.trim()) {
    throw { code: 'VALIDATION', message: 'Terms text is required' }
  }
  if (policy.collectionType === 'percent') {
    computeDepositMinor(policy, 10_000)
  }
  if (policy.collectionType === 'fixed') {
    computeDepositMinor(policy, 10_000)
  }
}
