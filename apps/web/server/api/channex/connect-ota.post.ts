import { parseNetworkId, requireIntegrationsAccess } from '../../utils/integrations'
import { connectOtaChannel } from '../../utils/channex-connect-ota'
import { isOtaCode } from '../../../shared/otas'

type Body = {
  networkId?: number
  channel?: string
}

/** POST /api/channex/connect-ota — auto-provision property (if needed) + mint OTA iframe. */
export default defineEventHandler(async (event) => {
  const body = (await readBody(event).catch(() => ({}))) as Body
  const networkId = parseNetworkId(body.networkId)
  const { principal } = await requireIntegrationsAccess(event, networkId)
  if (principal.networkId !== networkId) {
    throw createError({ statusCode: 403, statusMessage: 'Network mismatch' })
  }

  const channel = body.channel?.trim()
  if (!channel || !isOtaCode(channel.toUpperCase())) {
    throw createError({ statusCode: 400, statusMessage: 'channel required' })
  }

  const result = await connectOtaChannel(networkId, channel.toUpperCase())
  return {
    property: result.property,
    url: result.url,
    channels: result.channels,
    created: result.created,
  }
})
