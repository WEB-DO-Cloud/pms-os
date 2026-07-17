/**
 * Require a better-auth session for all app routes except auth surfaces.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const publicPaths = new Set(['/login', '/setup', '/signup'])
  if (publicPaths.has(to.path)) return

  const { data: setup } = await useFetch('/api/setup/status', {
    key: 'setup-status',
  })
  if (setup.value?.needsSetup) {
    return navigateTo('/setup')
  }

  const { data: session } = await useFetch('/api/auth/get-session', {
    key: 'auth-session',
  })
  const user =
    session.value && typeof session.value === 'object'
      ? (session.value as { user?: unknown }).user
      : null
  if (!user) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }
})
