import { count } from 'drizzle-orm'
import { user } from '@pms/auth'
import { getDb } from '../../utils/auth'
import { getPmsEdition, isCommercialEdition } from '../../utils/edition'

/** GET /api/setup/status — edition + whether first-admin bootstrap is open. */
export default defineEventHandler(async () => {
  const edition = getPmsEdition()
  const db = getDb()
  const [row] = await db.select({ n: count() }).from(user)
  const users = Number(row?.n ?? 0)
  const hasUsers = users > 0
  // Community self-host: one-time setup while empty. Commercial: never.
  const needsSetup = edition === 'community' && !hasUsers
  return {
    edition,
    needsSetup,
    hasUsers,
    signupEnabled: isCommercialEdition(),
  }
})
