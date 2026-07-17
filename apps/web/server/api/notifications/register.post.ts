import { createError, defineEventHandler, readBody } from 'h3'
import { requirePrincipal } from '../../utils/auth'
import { parseNetworkId } from '../../utils/integrations'
import {
  listPushTokensForUser,
  registerPushToken,
  type PushPlatform,
} from '../../utils/notifications'

function parsePlatform(value: unknown): PushPlatform {
  if (value === 'ios' || value === 'android' || value === 'web' || value === 'native') {
    return value === 'native' ? 'android' : value
  }
  throw createError({ statusCode: 400, statusMessage: 'Invalid platform' })
}

/** POST /api/notifications/register — bind a device push token to the session user. */
export default defineEventHandler(async (event) => {
  const body = await readBody<{
    token?: string
    platform?: string
    networkId?: number | string
    propertyId?: number | string | null
  }>(event)

  const networkId = parseNetworkId(body.networkId)
  const { principal } = await requirePrincipal(event, networkId)

  const token = typeof body.token === 'string' ? body.token.trim() : ''
  if (!token || token.length > 512) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid token' })
  }

  const propertyId =
    body.propertyId == null || body.propertyId === ''
      ? null
      : Number(body.propertyId)

  const record = registerPushToken({
    userId: principal.userId,
    networkId: principal.networkId ?? networkId,
    propertyId: Number.isFinite(propertyId) ? propertyId : null,
    token,
    platform: parsePlatform(body.platform),
  })

  return {
    ok: true,
    registration: {
      userId: record.userId,
      networkId: record.networkId,
      propertyId: record.propertyId,
      platform: record.platform,
      // Never echo full production secrets; token is a device id, still redact in lists.
      tokenPreview: `${record.token.slice(0, 8)}…`,
      updatedAt: record.updatedAt,
    },
    deviceCount: listPushTokensForUser(principal.userId).length,
  }
})
