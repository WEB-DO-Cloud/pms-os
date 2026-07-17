import { isCommercialEdition } from '../utils/edition'
import { provisionTenant } from '../utils/provision-tenant'

/**
 * POST /api/signup — always-on tenant signup for commercial multi-tenant.
 * Disabled on community/self-hosted (use /api/setup/bootstrap once).
 */
export default defineEventHandler(async (event) => {
  if (!isCommercialEdition()) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Public signup is only available on the commercial platform.',
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
  if (networkName.length < 2) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Network name is required',
    })
  }

  try {
    const created = await provisionTenant({
      name,
      email,
      password,
      networkName,
      headers: event.headers,
      // Commercial tenants: white-label branding + multi-network switching.
      entitlements: { whiteLabel: true, multiNetwork: true },
    })
    return { ok: true, ...created }
  } catch (e: unknown) {
    const msg =
      e instanceof Error
        ? e.message
        : typeof e === 'object' && e && 'message' in e
          ? String((e as { message: unknown }).message)
          : ''
    if (/already|exists|unique/i.test(msg)) {
      throw createError({
        statusCode: 409,
        statusMessage: 'An account with this email already exists. Sign in instead.',
      })
    }
    throw e
  }
})
