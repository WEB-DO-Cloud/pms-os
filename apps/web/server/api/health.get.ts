/** GET /api/health — liveness for Docker / reverse-proxy probes. */
export default defineEventHandler(async () => {
  const started = Date.now()
  let database: 'ok' | 'error' | 'skipped' = 'skipped'

  if (process.env.DATABASE_URL) {
    try {
      const { getDb } = await import('../utils/auth')
      const { sql } = await import('drizzle-orm')
      await getDb().execute(sql`select 1`)
      database = 'ok'
    } catch {
      database = 'error'
    }
  }

  const ok = database !== 'error'
  setResponseStatus(ok ? 200 : 503)
  return {
    status: ok ? 'ok' : 'degraded',
    service: 'web',
    database,
    ms: Date.now() - started,
  }
})
