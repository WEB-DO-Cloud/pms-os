import { getAuth, getAuthSession } from '../../../utils/auth'
import { writeAuditEvent } from '../../../utils/audit'

/**
 * POST /api/super-admin/impersonate/stop
 * End support impersonation and restore the admin session.
 */
export default defineEventHandler(async (event) => {
  const session = await getAuthSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const impersonatedBy = (
    session.session as { impersonatedBy?: string | null }
  ).impersonatedBy
  if (!impersonatedBy) {
    throw createError({
      statusCode: 400,
      statusMessage: 'You are not impersonating anyone',
    })
  }

  const auth = getAuth()
  try {
    const result = await auth.api.stopImpersonating({
      headers: event.headers,
      returnHeaders: true,
    })

    const headers =
      result && typeof result === 'object' && 'headers' in result
        ? (result.headers as Headers)
        : null
    if (headers) {
      const cookies = headers.getSetCookie?.() ?? []
      for (const cookie of cookies) {
        appendHeader(event, 'set-cookie', cookie)
      }
      if (cookies.length === 0) {
        const single = headers.get('set-cookie')
        if (single) appendHeader(event, 'set-cookie', single)
      }
    }

    await writeAuditEvent({
      principalType: 'super_admin',
      principalId: impersonatedBy,
      action: 'super_admin.impersonate.stop',
      resourceType: 'user',
      resourceId: session.user.id,
    })

    return { ok: true }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Could not stop impersonation'
    throw createError({ statusCode: 400, statusMessage: msg })
  }
})
