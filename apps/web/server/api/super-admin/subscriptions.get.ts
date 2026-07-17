import { desc, eq } from 'drizzle-orm'
import {
  networkEntitlements,
  networks,
} from '@pms/db'
import { billingSnapshot } from '@pms/licensing'
import { getDb, requirePlatformAdmin } from '../../utils/auth'

/** GET /api/super-admin/subscriptions — tenant networks + entitlements. */
export default defineEventHandler(async (event) => {
  await requirePlatformAdmin(event)
  const db = getDb()

  const rows = await db
    .select({
      id: networks.id,
      name: networks.name,
      slug: networks.slug,
      isActive: networks.isActive,
      logoUrl: networks.logoUrl,
      brandDisplayName: networks.brandDisplayName,
      channexGroupId: networks.channexGroupId,
      createdAt: networks.createdAt,
      multiNetwork: networkEntitlements.multiNetwork,
      whiteLabel: networkEntitlements.whiteLabel,
      licenseKeyFingerprint: networkEntitlements.licenseKeyFingerprint,
      entitlementsUpdatedAt: networkEntitlements.updatedAt,
    })
    .from(networks)
    .leftJoin(
      networkEntitlements,
      eq(networkEntitlements.networkId, networks.id),
    )
    .orderBy(desc(networks.createdAt))

  return {
    networks: rows.map((r) => {
      const entitlements = {
        multiNetwork: r.multiNetwork === true,
        whiteLabel: r.whiteLabel === true,
      }
      return {
        id: r.id,
        name: r.name,
        slug: r.slug,
        isActive: r.isActive,
        logoUrl: r.logoUrl,
        brandDisplayName: r.brandDisplayName,
        channexGroupId: r.channexGroupId,
        createdAt: r.createdAt,
        entitlements,
        billing: billingSnapshot(entitlements),
        licenseKeyFingerprint: r.licenseKeyFingerprint,
        entitlementsUpdatedAt: r.entitlementsUpdatedAt,
      }
    }),
  }
})
