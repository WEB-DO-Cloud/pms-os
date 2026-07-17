import { eq } from 'drizzle-orm'
import { networkMemberships, networks } from '@pms/db'
import {
  getAuthSession,
  getDb,
  resolveRequestPrincipal,
} from '../utils/auth'
import { getPmsEdition } from '../utils/edition'

/** GET /api/me — session user + principal + accessible networks. */
export default defineEventHandler(async (event) => {
  const session = await getAuthSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const edition = getPmsEdition()
  const q = getQuery(event)
  const networkId =
    q.networkId != null && q.networkId !== ''
      ? Number(q.networkId)
      : undefined

  const resolved = await resolveRequestPrincipal(
    event,
    Number.isFinite(networkId) ? networkId : undefined,
  )
  if (!resolved) {
    return {
      edition,
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      },
      principal: null,
      networks: [],
      branding: null,
      needsMembership: true,
    }
  }

  const db = getDb()
  const membershipRows = await db
    .select({
      networkId: networkMemberships.networkId,
      role: networkMemberships.role,
      name: networks.name,
      slug: networks.slug,
      logoUrl: networks.logoUrl,
      brandDisplayName: networks.brandDisplayName,
      brandAccentColor: networks.brandAccentColor,
    })
    .from(networkMemberships)
    .innerJoin(networks, eq(networks.id, networkMemberships.networkId))
    .where(eq(networkMemberships.userId, session.user.id))

  const active =
    membershipRows.find((m) => m.networkId === resolved.principal.networkId) ??
    membershipRows[0]

  return {
    edition,
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    },
    principal: resolved.principal,
    networks: membershipRows.map((m) => ({
      id: m.networkId,
      name: m.name,
      code: m.slug.toUpperCase().slice(0, 6),
      role: m.role,
      logoUrl: m.logoUrl,
    })),
    branding: active
      ? {
          networkId: active.networkId,
          displayName: active.brandDisplayName,
          logoUrl: active.logoUrl,
          accentColor: active.brandAccentColor,
        }
      : null,
    needsMembership: false,
  }
})
