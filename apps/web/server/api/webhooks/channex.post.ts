import {
  handleChannexWebhook,
} from '../../utils/sync'

/**
 * Channex webhook ingress.
 * Auth: `x-channex-webhook-secret` must match network's stored webhook secret.
 * Network scope: `x-pms-network-id` header (required).
 * Webhooks trigger revision fetch; feed pull remains authoritative fallback.
 */
export default defineEventHandler(async (event) => {
  const networkIdHeader = getHeader(event, 'x-pms-network-id')
  const networkId = networkIdHeader ? Number(networkIdHeader) : NaN
  if (!Number.isFinite(networkId) || networkId < 1) {
    throw createError({ statusCode: 400, statusMessage: 'x-pms-network-id required' })
  }

  const rawBody = await readRawBody(event)
  if (!rawBody) {
    throw createError({ statusCode: 400, statusMessage: 'Empty body' })
  }

  const secretHeader = getHeader(event, 'x-channex-webhook-secret') ?? undefined
  const result = await handleChannexWebhook(networkId, secretHeader, rawBody.toString())

  if ('message' in result && result.status !== 'processed' && result.status !== 'ignored' && result.status !== 'duplicate') {
    const code = result.status
    if (code === 'INVALID_SECRET' || code === 'NO_SECRET') {
      throw createError({ statusCode: 401, statusMessage: result.message })
    }
    throw createError({ statusCode: 400, statusMessage: result.message })
  }

  if (result.status === 'duplicate') {
    return { ok: true, duplicate: true }
  }

  return { ok: true, ...result }
})
