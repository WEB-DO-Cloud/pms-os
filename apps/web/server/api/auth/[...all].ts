import { getAuth } from '../../utils/auth'

/**
 * better-auth catch-all. Block public email signup — tenants must go through
 * /api/setup/bootstrap (community) or /api/signup (commercial), which call the
 * auth API server-side and also create network membership.
 */
export default defineEventHandler((event) => {
  const path = getRequestURL(event).pathname
  if (
    getMethod(event) === 'POST' &&
    (path.endsWith('/sign-up/email') || path.endsWith('/sign-up'))
  ) {
    throw createError({
      statusCode: 403,
      statusMessage:
        'Direct signup is disabled. Use /signup (commercial) or /setup (community).',
    })
  }
  return getAuth().handler(toWebRequest(event))
})
