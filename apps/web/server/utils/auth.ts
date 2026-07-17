import { and, eq, inArray } from 'drizzle-orm'
import {
  buildPrincipal,
  createAuth,
  createLoginRateLimiter,
  user,
  type Auth,
  type PrincipalContext,
} from '@pms/auth'
import {
  createDb,
  networkEntitlements,
  networkMemberships,
  ownerProperties,
  propertyMemberships,
  type Db,
} from '@pms/db'
import { resolveEntitlements } from '@pms/licensing'
import { isCommercialEdition } from './edition'
import { isSuperAdminEmail, parseSuperAdminEmails } from './super-admin'

let _auth: Auth | null = null
let _db: Db | null = null
let _syncedAdmins = false

export const loginRateLimiter = createLoginRateLimiter({
  windowMs: 60_000,
  max: 10,
})

export function getDb(): Db {
  if (!_db) {
    _db = createDb(process.env.DATABASE_URL)
  }
  return _db
}

export function getAuth(): Auth {
  if (!_auth) {
    _auth = createAuth({
      db: getDb(),
      secret: process.env.BETTER_AUTH_SECRET,
      baseURL: process.env.BETTER_AUTH_URL,
    })
  }
  return _auth
}

/** Promote SUPER_ADMIN_EMAILS users to better-auth `admin` role. */
export async function syncSuperAdminRoles() {
  if (_syncedAdmins) return
  const emails = parseSuperAdminEmails()
  if (emails.length === 0) {
    _syncedAdmins = true
    return
  }
  const db = getDb()
  const rows = await db
    .select({ id: user.id, email: user.email })
    .from(user)
  const ids = rows
    .filter((r) => emails.includes(r.email.toLowerCase()))
    .map((r) => r.id)
  if (ids.length > 0) {
    await db.update(user).set({ role: 'admin' }).where(inArray(user.id, ids))
  }
  _syncedAdmins = true
}

export async function getAuthSession(event: { headers: Headers }) {
  return getAuth().api.getSession({ headers: event.headers })
}

/**
 * Commercial SaaS console gate. Env allowlist + better-auth admin role.
 * Blocks while impersonating.
 */
export async function requirePlatformAdmin(event: { headers: Headers }) {
  if (!isCommercialEdition()) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Super admin is only available on the commercial platform.',
    })
  }

  await syncSuperAdminRoles()
  const session = await getAuthSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const impersonatedBy = (
    session.session as { impersonatedBy?: string | null }
  ).impersonatedBy
  if (impersonatedBy) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Stop impersonating before using super admin.',
    })
  }

  const role = (session.user as { role?: string | null }).role
  if (!isSuperAdminEmail(session.user.email) && role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Super admin only' })
  }

  return session
}

/**
 * Shared path for session → principal → network → entitlements.
 * Used by server routes; domain commands (U4) will consume PrincipalContext.
 */
export async function resolveRequestPrincipal(
  event: { headers: Headers },
  networkId?: number,
): Promise<{
  session: NonNullable<Awaited<ReturnType<typeof getAuthSession>>>
  principal: PrincipalContext
} | null> {
  const session = await getAuthSession(event)
  if (!session?.user) return null

  const db = getDb()
  const memberships = await db
    .select()
    .from(networkMemberships)
    .where(eq(networkMemberships.userId, session.user.id))

  if (memberships.length === 0) return null

  const membership =
    networkId != null
      ? memberships.find((m) => m.networkId === networkId)
      : memberships[0]
  if (!membership) return null

  const [propRows, ownerRows, entitlementRow] = await Promise.all([
    db
      .select({ propertyId: propertyMemberships.propertyId })
      .from(propertyMemberships)
      .where(
        and(
          eq(propertyMemberships.userId, session.user.id),
          eq(propertyMemberships.networkId, membership.networkId),
        ),
      ),
    db
      .select({ propertyId: ownerProperties.propertyId })
      .from(ownerProperties)
      .where(
        and(
          eq(ownerProperties.userId, session.user.id),
          eq(ownerProperties.networkId, membership.networkId),
        ),
      ),
    db
      .select()
      .from(networkEntitlements)
      .where(eq(networkEntitlements.networkId, membership.networkId))
      .then((rows) => rows[0] ?? null),
  ])

  const principal = buildPrincipal({
    userId: session.user.id,
    email: session.user.email,
    networkId: membership.networkId,
    role: membership.role,
    propertyIds: propRows.map((r) => r.propertyId),
    ownerPropertyIds: ownerRows.map((r) => r.propertyId),
    twoFactorEnabled: Boolean(
      (session.user as { twoFactorEnabled?: boolean }).twoFactorEnabled,
    ),
    entitlements: resolveEntitlements(
      entitlementRow
        ? {
            multiNetwork: entitlementRow.multiNetwork,
            whiteLabel: entitlementRow.whiteLabel,
          }
        : null,
    ),
  })

  if (!principal) return null
  return { session, principal }
}

export async function requirePrincipal(
  event: { headers: Headers },
  networkId?: number,
) {
  const resolved = await resolveRequestPrincipal(event, networkId)
  if (!resolved) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  return resolved
}
