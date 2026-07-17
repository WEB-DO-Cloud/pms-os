/**
 * Commercial-only boundary + billing/license visibility helpers.
 * Community keeps the full module surface; only these features are gated.
 */
import {
  canUseMultiNetwork,
  canUseWhiteLabel,
  resolveEntitlements,
  type Entitlements,
} from './entitlements'

/** Features that must never ship open in community builds. */
export const COMMERCIAL_ONLY_FEATURES = [
  {
    id: 'multi_network',
    label: 'Multi-network switching',
    description: 'Operate more than one active network from a single account.',
  },
  {
    id: 'white_label',
    label: 'White-label branding',
    description: 'Custom logo, brand name, and accent colors on the PMS shell.',
  },
] as const

export type CommercialFeatureId =
  (typeof COMMERCIAL_ONLY_FEATURES)[number]['id']

export type LicenseEdition = 'community' | 'commercial'

export type BillingSnapshot = {
  edition: LicenseEdition
  planLabel: string
  multiNetwork: boolean
  whiteLabel: boolean
  commercialFeatures: Array<{
    id: CommercialFeatureId
    label: string
    description: string
    enabled: boolean
  }>
}

export function licenseEdition(
  entitlements?: Partial<Entitlements> | null,
): LicenseEdition {
  const e = resolveEntitlements(entitlements)
  return e.multiNetwork || e.whiteLabel ? 'commercial' : 'community'
}

export function billingSnapshot(
  entitlements?: Partial<Entitlements> | null,
): BillingSnapshot {
  const e = resolveEntitlements(entitlements)
  const edition = licenseEdition(e)
  return {
    edition,
    planLabel: edition === 'commercial' ? 'Commercial hosted' : 'Community (AGPLv3)',
    multiNetwork: e.multiNetwork,
    whiteLabel: e.whiteLabel,
    commercialFeatures: COMMERCIAL_ONLY_FEATURES.map((f) => ({
      ...f,
      enabled:
        f.id === 'multi_network'
          ? canUseMultiNetwork(e)
          : canUseWhiteLabel(e),
    })),
  }
}

/** UI + API gate: white-label branding controls. Fail closed. */
export function canConfigureWhiteLabel(
  entitlements?: Partial<Entitlements> | null,
): boolean {
  return canUseWhiteLabel(entitlements)
}

/** UI + API gate: multi-network switcher. Fail closed. */
export function canConfigureMultiNetwork(
  entitlements?: Partial<Entitlements> | null,
): boolean {
  return canUseMultiNetwork(entitlements)
}
