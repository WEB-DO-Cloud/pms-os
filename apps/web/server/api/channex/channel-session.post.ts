import { parseNetworkId, requireIntegrationsAccess } from '../../utils/integrations'
import { createChannelIframeSession } from '../../utils/channex-channels'
import { isOtaCode } from '../../../shared/otas'

type Body = {
  networkId?: number
  propertyId?: number
  channel?: string
}

/** POST /api/channex/channel-session — mint Channex iframe URL for OTA channel connect. */
export default defineEventHandler(async (event) => {
  const body = (await readBody(event).catch(() => ({}))) as Body
  const networkId = parseNetworkId(body.networkId)
  const { principal } = await requireIntegrationsAccess(event, networkId)
  if (principal.networkId !== networkId) {
    throw createError({ statusCode: 403, statusMessage: 'Network mismatch' })
  }

  const propertyId = Number(body.propertyId)
  if (!Number.isFinite(propertyId) || propertyId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'propertyId required' })
  }

  const channel = body.channel?.trim()
  if (channel && !isOtaCode(channel.toUpperCase())) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown channel code' })
  }

  const session = await createChannelIframeSession(
    networkId,
    propertyId,
    channel?.toUpperCase(),
  )

  return { url: session.url, channels: session.channels }
})
