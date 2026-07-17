import {
  parseNetworkId,
  requireIntegrationsAccess,
  saveNetworkSecret,
  validateChannexApiKey,
} from '../../utils/integrations'
import { isCommercialEdition } from '../../utils/edition'

type Body = {
  networkId?: number
  apiKey?: string
  webhookSecret?: string
}

/**
 * POST /api/channex/credentials — validate API key, encrypt, persist.
 * Invalid keys are rejected without persistence. Response is masked only.
 */
export default defineEventHandler(async (event) => {
  if (isCommercialEdition()) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Channex is managed by the platform in commercial edition',
    })
  }
  const body = (await readBody(event).catch(() => ({}))) as Body
  const networkId = parseNetworkId(body.networkId)
  const { principal } = await requireIntegrationsAccess(event, networkId)
  if (principal.networkId !== networkId) {
    throw createError({ statusCode: 403, statusMessage: 'Network mismatch' })
  }

  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
  const webhookSecret =
    typeof body.webhookSecret === 'string' ? body.webhookSecret.trim() : ''

  if (!apiKey) {
    throw createError({ statusCode: 400, statusMessage: 'apiKey required' })
  }

  await validateChannexApiKey(apiKey)

  const apiKeyStatus = await saveNetworkSecret(networkId, 'channex_api_key', apiKey)
  let webhookStatus = null
  if (webhookSecret) {
    webhookStatus = await saveNetworkSecret(
      networkId,
      'channex_webhook_secret',
      webhookSecret,
    )
  }

  return {
    networkId,
    apiKey: { configured: apiKeyStatus.configured, masked: apiKeyStatus.masked },
    webhookSecret: webhookStatus
      ? { configured: webhookStatus.configured, masked: webhookStatus.masked }
      : undefined,
  }
})
