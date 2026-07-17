import { createError, defineEventHandler, getQuery } from 'h3'
import { requirePrincipal } from '../../utils/auth'
import { parseNetworkId } from '../../utils/integrations'
import { authorizeNotificationDeepLink } from '../../utils/notifications'

/**
 * GET /api/notifications/deep-link?path=&networkId=
 * Re-check authorization before following a push deep link.
 */
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const networkId = parseNetworkId(q.networkId)
  const { principal } = await requirePrincipal(event, networkId)

  const path = typeof q.path === 'string' ? q.path : ''
  if (!path.startsWith('/')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid path' })
  }

  const result = authorizeNotificationDeepLink(path, principal)
  if (!result.ok) {
    throw createError({
      statusCode: result.reason === 'unauthenticated' ? 401 : 403,
      statusMessage: `Deep link denied: ${result.reason}`,
    })
  }

  return { ok: true, path: result.path, module: result.module }
})
