import { getAuthSession, requirePlatformAdmin } from '../../utils/auth'
import { isCommercialEdition } from '../../utils/edition'
import { isSuperAdminEmail } from '../../utils/super-admin'

/** GET /api/super-admin/me — whether the current user can open the SaaS console. */
export default defineEventHandler(async (event) => {
  if (!isCommercialEdition()) {
    return { enabled: false, isSuperAdmin: false, impersonating: false }
  }

  const session = await getAuthSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const impersonatedBy = (
    session.session as { impersonatedBy?: string | null }
  ).impersonatedBy
  if (impersonatedBy) {
    return {
      enabled: true,
      isSuperAdmin: false,
      impersonating: true,
      impersonatedBy,
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      },
    }
  }

  try {
    await requirePlatformAdmin(event)
    return {
      enabled: true,
      isSuperAdmin: true,
      impersonating: false,
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        role: (session.user as { role?: string }).role ?? null,
      },
      allowlistMatch: isSuperAdminEmail(session.user.email),
    }
  } catch {
    return {
      enabled: true,
      isSuperAdmin: false,
      impersonating: false,
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      },
    }
  }
})
