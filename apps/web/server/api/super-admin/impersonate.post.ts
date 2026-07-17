import { getAuth, requirePlatformAdmin } from '../../utils/auth'
import { writeAuditEvent } from '../../utils/audit'

/**
 * POST /api/super-admin/impersonate
 * Start a support session as the target user (better-auth admin plugin).
 */
export default defineEventHandler(async (event) => {
  const admin = await requirePlatformAdmin(event)
  const body = await readBody<{ userId?: string; reason?: string }>(event)
  const userId = body.userId?.trim()
  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'userId is required' })
  }
  if (userId === admin.user.id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Cannot impersonate yourself',
    })
  }

  const reason = body.reason?.trim() || 'support'
  const auth = getAuth()

  try {
    const result = await auth.api.impersonateUser({
      body: { userId },
      headers: event.headers,
      // Forward Set-Cookie so the browser becomes the target user.
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
      // Fallback for runtimes without getSetCookie
      if (cookies.length === 0) {
        const single = headers.get('set-cookie')
        if (single) appendHeader(event, 'set-cookie', single)
      }
    }

    await writeAuditEvent({
      principalType: 'super_admin',
      principalId: admin.user.id,
      action: 'super_admin.impersonate.start',
      resourceType: 'user',
      resourceId: userId,
      metadata: { reason },
    })

    const payload =
      result && typeof result === 'object' && 'response' in result
        ? (result as { response: unknown }).response
        : result

    return { ok: true, ...(payload as object) }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Impersonation failed'
    throw createError({ statusCode: 400, statusMessage: msg })
  }
})
