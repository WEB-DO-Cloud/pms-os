import type { PrincipalContext } from '@pms/auth'

/** Guest writes go through runCommand as a user, never automation (KTD12). */
export function buildPublicBookingPrincipal(
  networkId: number,
  propertyId: number,
): PrincipalContext {
  return {
    userId: `public-booking:${networkId}`,
    networkId,
    role: 'front_desk',
    networkWide: false,
    propertyIds: [propertyId],
    ownerPropertyIds: [],
    entitlements: { multiNetwork: false, whiteLabel: false },
  }
}
