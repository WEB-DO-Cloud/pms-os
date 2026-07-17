import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin } from 'better-auth/plugins'
import { twoFactor } from 'better-auth/plugins/two-factor'
import * as authSchema from './auth-schema'
import {
  canAccessModule,
  canAccessProperty,
  canPerformAction,
  isMemberRole,
  isNetworkWideRole,
  requiresTwoFactor,
  type AppModule,
  type MemberRole,
  type PrivilegedAction,
  type PropertyScopePrincipal,
} from './roles'

export type AuthDb = Parameters<typeof drizzleAdapter>[0]

export type CreateAuthOptions = {
  db: AuthDb
  secret?: string
  baseURL?: string
  /** Force Secure cookies (default: true in production). */
  useSecureCookies?: boolean
  /** User IDs that always have platform admin permissions. */
  adminUserIds?: string[]
}

/**
 * better-auth instance with Drizzle adapter, email/password, 2FA plugin,
 * admin/impersonation plugin, secure cookie posture, CSRF, and rate limits.
 */
export function createAuth(opts: CreateAuthOptions) {
  const isProd = process.env.NODE_ENV === 'production'
  const baseURL = opts.baseURL ?? process.env.BETTER_AUTH_URL
  return betterAuth({
    database: drizzleAdapter(opts.db, {
      provider: 'pg',
      schema: authSchema,
    }),
    secret: opts.secret ?? process.env.BETTER_AUTH_SECRET,
    baseURL,
    trustedOrigins: [
      baseURL,
      'https://app.pms.do',
      'https://pms.do',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:33100',
    ].filter(Boolean) as string[],
    emailAndPassword: {
      enabled: true,
      // Public HTTP signup is blocked in the Nitro auth handler; tenants
      // provision via /api/signup (commercial) or /api/setup/bootstrap (community).
    },
    plugins: [
      twoFactor({
        issuer: 'PMS OS',
      }),
      admin({
        defaultRole: 'user',
        adminRoles: ['admin'],
        adminUserIds: opts.adminUserIds ?? [],
        impersonationSessionDuration: 60 * 60,
      }),
    ],
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5,
      },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 10 },
        '/two-factor/verify-totp': { window: 60, max: 5 },
        '/two-factor/verify-backup-code': { window: 60, max: 5 },
      },
    },
    advanced: {
      useSecureCookies: opts.useSecureCookies ?? isProd,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax',
        secure: opts.useSecureCookies ?? isProd,
        path: '/',
      },
      // CSRF origin checks stay enabled (do not set disableCSRFCheck).
    },
  })
}

export type Auth = ReturnType<typeof createAuth>

export type AuthSession = Awaited<ReturnType<Auth['api']['getSession']>>

/** Membership + entitlement snapshot used by domain commands (U4). */
export type PrincipalContext = PropertyScopePrincipal & {
  userId: string
  networkId: number | null
  email?: string | null
  twoFactorEnabled?: boolean
  entitlements: {
    multiNetwork: boolean
    whiteLabel: boolean
  }
}

export type MembershipInput = {
  userId: string
  email?: string | null
  networkId: number | null
  role: MemberRole | string | null
  propertyIds?: readonly number[]
  ownerPropertyIds?: readonly number[]
  networkWide?: boolean
  twoFactorEnabled?: boolean
  entitlements?: {
    multiNetwork?: boolean
    whiteLabel?: boolean
  } | null
}

/**
 * Build the shared principal used by UI, API, and (later) domain commands.
 * Entitlements fail closed when missing.
 */
export function buildPrincipal(input: MembershipInput): PrincipalContext | null {
  if (!input.userId || !isMemberRole(input.role)) return null
  const networkWide =
    input.networkWide ?? isNetworkWideRole(input.role)
  return {
    userId: input.userId,
    email: input.email ?? null,
    networkId: input.networkId,
    role: input.role,
    networkWide,
    propertyIds: input.propertyIds ?? [],
    ownerPropertyIds: input.ownerPropertyIds ?? [],
    twoFactorEnabled: input.twoFactorEnabled ?? false,
    entitlements: {
      multiNetwork: input.entitlements?.multiNetwork === true,
      whiteLabel: input.entitlements?.whiteLabel === true,
    },
  }
}

export function principalCanAccessModule(
  principal: PrincipalContext | null | undefined,
  module: AppModule,
): boolean {
  return canAccessModule(principal?.role, module)
}

export function principalCanPerformAction(
  principal: PrincipalContext | null | undefined,
  action: PrivilegedAction,
): boolean {
  return canPerformAction(principal?.role, action)
}

export function principalCanAccessProperty(
  principal: PrincipalContext | null | undefined,
  propertyId: number,
): boolean {
  if (!principal) return false
  return canAccessProperty(principal, propertyId)
}

export function principalRequiresTwoFactor(
  principal: PrincipalContext | null | undefined,
): boolean {
  if (!principal) return false
  return requiresTwoFactor(principal.role)
}

/** Session list helper — wraps better-auth listSessions. */
export async function listSessionsForRequest(
  auth: Auth,
  headers: Headers,
) {
  return auth.api.listSessions({ headers })
}

/** Revoke a single session by token. */
export async function revokeSessionByToken(
  auth: Auth,
  headers: Headers,
  token: string,
) {
  return auth.api.revokeSession({ headers, body: { token } })
}

/** Revoke all sessions for the current user. */
export async function revokeAllSessions(
  auth: Auth,
  headers: Headers,
) {
  return auth.api.revokeSessions({ headers })
}

/**
 * Small in-memory login rate limiter for callers that need an extra guard
 * outside better-auth's built-in rateLimit (e.g. custom login routes).
 * Ceiling: single-process only — upgrade to Redis for multi-instance.
 */
export function createLoginRateLimiter(opts?: {
  windowMs?: number
  max?: number
}) {
  const windowMs = opts?.windowMs ?? 60_000
  const max = opts?.max ?? 10
  const hits = new Map<string, { count: number; resetAt: number }>()

  return {
    check(key: string): { allowed: boolean; remaining: number } {
      const now = Date.now()
      const row = hits.get(key)
      if (!row || row.resetAt <= now) {
        hits.set(key, { count: 1, resetAt: now + windowMs })
        return { allowed: true, remaining: max - 1 }
      }
      if (row.count >= max) {
        return { allowed: false, remaining: 0 }
      }
      row.count += 1
      return { allowed: true, remaining: max - row.count }
    },
    // ponytail: in-memory Map; swap for shared store when running >1 app process
    reset(key: string) {
      hits.delete(key)
    },
  }
}
