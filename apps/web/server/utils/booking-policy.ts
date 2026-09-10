import { isNetworkWideRole, type MemberRole } from '@pms/auth'
import {
  assertLivePolicyShape,
  collectNowNeedsCharges,
  computeDepositMinor,
  isCollectionType,
  type CollectionType,
  type LiveCollectionPolicy,
} from '@pms/domain'
import { and, eq } from 'drizzle-orm'
import { properties } from '@pms/db'
import { getDb, requirePrincipal } from './auth'
import { getDomainStore } from './reservations'

export function canManageBookingPolicy(role: string | null | undefined): boolean {
  return role === 'org_admin' || role === 'manager'
    ? isNetworkWideRole(role as MemberRole)
    : false
}

export async function requireBookingPolicyAccess(
  event: { headers: Headers },
  networkId: number,
) {
  const resolved = await requirePrincipal(event, networkId)
  if (!canManageBookingPolicy(resolved.principal.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  return resolved
}

export function policyFromRow(input: {
  propertyId: number
  bookingCollectionType: string | null
  bookingCollectionPercent: number | null
  bookingCollectionFixedMinor: number | null
  bookingTermsText: string | null
  stripeConnectAccountId: string | null
  stripeChargesEnabled: boolean | null
  bookingPolicyUpdatedAt: Date | string | null
}): LiveCollectionPolicy | null {
  if (!input.bookingCollectionType || !isCollectionType(input.bookingCollectionType)) {
    return null
  }
  if (!input.bookingTermsText?.trim()) return null
  return {
    propertyId: input.propertyId,
    collectionType: input.bookingCollectionType,
    percent: input.bookingCollectionPercent,
    fixedAmountMinor: input.bookingCollectionFixedMinor,
    termsText: input.bookingTermsText,
    stripeConnectAccountId: input.stripeConnectAccountId,
    stripeChargesEnabled: input.stripeChargesEnabled === true,
    updatedAt:
      input.bookingPolicyUpdatedAt instanceof Date
        ? input.bookingPolicyUpdatedAt.toISOString()
        : (input.bookingPolicyUpdatedAt ?? new Date(0).toISOString()),
  }
}

export function getLivePolicy(
  networkId: number,
  propertyId: number,
): LiveCollectionPolicy | null {
  const store = getDomainStore(networkId)
  return store.bookingPolicies.find((p) => p.propertyId === propertyId) ?? null
}

export function upsertLivePolicy(
  networkId: number,
  policy: LiveCollectionPolicy,
): LiveCollectionPolicy {
  assertLivePolicyShape(policy)
  const store = getDomainStore(networkId)
  const idx = store.bookingPolicies.findIndex((p) => p.propertyId === policy.propertyId)
  if (idx >= 0) store.bookingPolicies[idx] = policy
  else store.bookingPolicies.push(policy)
  return policy
}

export async function persistLivePolicy(
  networkId: number,
  policy: LiveCollectionPolicy,
): Promise<LiveCollectionPolicy> {
  const saved = upsertLivePolicy(networkId, policy)
  if (!process.env.DATABASE_URL) return saved
  const db = getDb()
  await db
    .update(properties)
    .set({
      bookingCollectionType: policy.collectionType,
      bookingCollectionPercent: policy.percent,
      bookingCollectionFixedMinor: policy.fixedAmountMinor,
      bookingTermsText: policy.termsText,
      stripeConnectAccountId: policy.stripeConnectAccountId,
      stripeChargesEnabled: policy.stripeChargesEnabled,
      bookingPolicyUpdatedAt: new Date(policy.updatedAt),
      updatedAt: new Date(),
    })
    .where(and(eq(properties.id, policy.propertyId), eq(properties.networkId, networkId)))
  return saved
}

export function previewDeposit(
  policy: LiveCollectionPolicy,
  stayTotalMinor: number,
): { depositMinor: number; collectNowNotReady: boolean } {
  return {
    depositMinor: computeDepositMinor(policy, stayTotalMinor),
    collectNowNotReady: collectNowNeedsCharges(policy),
  }
}

export function parseCollectionType(raw: unknown): CollectionType {
  if (typeof raw !== 'string' || !isCollectionType(raw)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid collection type' })
  }
  return raw
}
