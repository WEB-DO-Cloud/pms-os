import { count } from 'drizzle-orm'
import { user } from '@pms/auth'
import { getDb } from '../../utils/auth'
import { isCommercialEdition } from '../../utils/edition'
import { provisionTenant } from '../../utils/provision-tenant'

/**
 * POST /api/setup/bootstrap — create the first org admin + network.
 * Community self-host only. Locked once any user exists.
 * Commercial uses POST /api/signup instead.
 */
export default defineEventHandler(async (event) => {
  if (isCommercialEdition()) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Use /signup on the commercial platform.',
    })
  }

  const body = await readBody<{
    name?: string
    email?: string
    password?: string
    networkName?: string
  }>(event)

  const name = body.name?.trim() ?? ''
  const email = body.email?.trim().toLowerCase() ?? ''
  const password = body.password ?? ''
  const networkName = body.networkName?.trim() || 'My Network'

  if (name.length < 2) {
    throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw createError({ statusCode: 400, statusMessage: 'Valid email is required' })
  }
  if (password.length < 8) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Password must be at least 8 characters',
    })
  }

  const db = getDb()
  const [row] = await db.select({ n: count() }).from(user)
  if (Number(row?.n ?? 0) > 0) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Setup is already complete. Sign in instead.',
    })
  }

  const created = await provisionTenant({
    name,
    email,
    password,
    networkName,
    headers: event.headers,
  })

  return { ok: true, ...created }
})
