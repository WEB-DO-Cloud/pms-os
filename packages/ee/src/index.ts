/**
 * Commercial-only helpers. Fail closed — never enable multi-network or
 * white-label unless @pms/licensing says the entitlement is explicitly true.
 */
import {
  assertMultiNetwork as licensingAssertMultiNetwork,
  assertWhiteLabel as licensingAssertWhiteLabel,
  canUseMultiNetwork,
  canUseWhiteLabel,
  resolveEntitlements,
  type Entitlements,
} from '@pms/licensing'

export type { Entitlements }

/** Re-export fail-closed reads for commercial UI/API surfaces. */
export { canUseMultiNetwork, canUseWhiteLabel, resolveEntitlements }

/**
 * Gate a commercial multi-network operation. Throws if entitlement is missing.
 * Direct API callers cannot bypass this by omitting entitlement fields.
 */
export function requireMultiNetwork(
  entitlements?: Partial<Entitlements> | null,
): void {
  licensingAssertMultiNetwork(entitlements)
}

/** Gate commercial white-label branding. Fail closed. */
export function requireWhiteLabel(
  entitlements?: Partial<Entitlements> | null,
): void {
  licensingAssertWhiteLabel(entitlements)
}

/** True only when commercial multi-network is entitled. */
export function isCommercialMultiNetwork(
  entitlements?: Partial<Entitlements> | null,
): boolean {
  return canUseMultiNetwork(entitlements)
}

/** True only when commercial white-label is entitled. */
export function isCommercialWhiteLabel(
  entitlements?: Partial<Entitlements> | null,
): boolean {
  return canUseWhiteLabel(entitlements)
}
