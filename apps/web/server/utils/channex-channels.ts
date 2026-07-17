import { channexAppBaseUrl, ChannexApiError } from '@pms/sync'
import { buildChannelIframeUrl } from '../../shared/channex-channel-url'
import { isOtaCode, OTA_CODES, type OtaCode } from '../../shared/otas'
import { ensureNetworkChannexGroup } from './channex-onboarding'
import {
  ensureSecretsHydrated,
  getChannexClientForNetwork,
} from './sync'

export type ChannelIframeSession = {
  url: string
  channexPropertyId: string
  groupId: string
  channels: readonly string[]
}

/** Build the Channex headless channels iframe URL for a local property. */
export async function createChannelIframeSession(
  networkId: number,
  localPropertyId: number,
  channelCode?: string,
): Promise<ChannelIframeSession> {
  const store = await ensureSecretsHydrated(networkId)
  const property = store
    .listProperties(networkId)
    .find((p) => p.id === localPropertyId)
  if (!property?.channexId) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Property not found or not linked to Channex',
    })
  }

  let channels: readonly string[]
  if (channelCode) {
    const code = channelCode.trim().toUpperCase()
    if (!isOtaCode(code)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Unknown channel code',
      })
    }
    channels = [code as OtaCode]
  } else {
    channels = OTA_CODES
  }

  const groupId = await ensureNetworkChannexGroup(networkId)
  const client = getChannexClientForNetwork(store, networkId)

  try {
    const tokenRes = await client.createOneTimeToken({
      propertyId: property.channexId,
      groupId,
      username: `network-${networkId}`,
    })
    const token = tokenRes.data?.token
    if (!token) {
      throw createError({
        statusCode: 502,
        statusMessage: 'Channex did not return a one-time token',
      })
    }

    const url = buildChannelIframeUrl({
      appBase: channexAppBaseUrl(),
      token,
      propertyId: property.channexId,
      groupId,
      channels,
    })

    return {
      url,
      channexPropertyId: property.channexId,
      groupId,
      channels,
    }
  } catch (err) {
    if (err instanceof ChannexApiError) {
      throw createError({
        statusCode: err.status >= 400 && err.status < 500 ? err.status : 502,
        statusMessage: 'Channex could not create a channel session',
        data: { code: 'CHANNEX_TOKEN_FAILED', message: err.message, body: err.body },
      })
    }
    throw err
  }
}

export { buildChannelIframeUrl }
