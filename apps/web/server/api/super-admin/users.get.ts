import { desc, eq } from 'drizzle-orm'
import { user } from '@pms/auth'
import {
  networkEntitlements,
  networkMemberships,
  networks,
} from '@pms/db'
import { billingSnapshot } from '@pms/licensing'
import { getDb, requirePlatformAdmin } from '../../utils/auth'

/** GET /api/super-admin/users — all tenant users with memberships. */
export default defineEventHandler(async (event) => {
  await requirePlatformAdmin(event)
  const db = getDb()

  const users = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      banned: user.banned,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    })
    .from(user)
    .orderBy(desc(user.createdAt))

  const memberships = await db
    .select({
      userId: networkMemberships.userId,
      role: networkMemberships.role,
      networkId: networks.id,
      networkName: networks.name,
      networkSlug: networks.slug,
      multiNetwork: networkEntitlements.multiNetwork,
      whiteLabel: networkEntitlements.whiteLabel,
    })
    .from(networkMemberships)
    .innerJoin(networks, eq(networks.id, networkMemberships.networkId))
    .leftJoin(
      networkEntitlements,
      eq(networkEntitlements.networkId, networks.id),
    )

  const byUser = new Map<string, typeof memberships>()
  for (const row of memberships) {
    const list = byUser.get(row.userId) ?? []
    list.push(row)
    byUser.set(row.userId, list)
  }

  return {
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      platformRole: u.role,
      banned: u.banned === true,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
      networks: (byUser.get(u.id) ?? []).map((m) => ({
        id: m.networkId,
        name: m.networkName,
        slug: m.networkSlug,
        role: m.role,
        billing: billingSnapshot({
          multiNetwork: m.multiNetwork === true,
          whiteLabel: m.whiteLabel === true,
        }),
      })),
    })),
  }
})
