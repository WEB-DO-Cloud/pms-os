/**
 * Fail-closed commercial entitlements for multi-network and white-label.
 * Missing / partial / non-boolean values never open a gate.
 */

export type Entitlements = {
  multiNetwork: boolean
  whiteLabel: boolean
}

export const COMMUNITY_ENTITLEMENTS: Readonly<Entitlements> = {
  multiNetwork: false,
  whiteLabel: false,
}

function asStrictBoolean(value: unknown): boolean {
  return value === true
}

export function resolveEntitlements(
  row?: Partial<Entitlements> | null,
): Entitlements {
  if (!row) return { ...COMMUNITY_ENTITLEMENTS }
  return {
    multiNetwork: asStrictBoolean(row.multiNetwork),
    whiteLabel: asStrictBoolean(row.whiteLabel),
  }
}

export function canUseMultiNetwork(
  entitlements?: Partial<Entitlements> | null,
): boolean {
  return resolveEntitlements(entitlements).multiNetwork
}

export function canUseWhiteLabel(
  entitlements?: Partial<Entitlements> | null,
): boolean {
  return resolveEntitlements(entitlements).whiteLabel
}

export function assertMultiNetwork(
  entitlements?: Partial<Entitlements> | null,
): void {
  if (!canUseMultiNetwork(entitlements)) {
    throw new Error('Commercial entitlement required: multi-network')
  }
}

export function assertWhiteLabel(
  entitlements?: Partial<Entitlements> | null,
): void {
  if (!canUseWhiteLabel(entitlements)) {
    throw new Error('Commercial entitlement required: white-label')
  }
}
