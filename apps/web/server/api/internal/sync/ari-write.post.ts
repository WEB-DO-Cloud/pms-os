import {
  requireInternalSyncAuth,
  runInternalAriWrite,
} from '../../../utils/sync'

/** POST /api/internal/sync/ari-write — drain ARI write outbox (availability lane). */
export default defineEventHandler(async (event) => {
  const body = (await readBody(event).catch(() => ({}))) as { networkId?: number }
  const networkId = Number(body.networkId)
  if (!Number.isFinite(networkId) || networkId < 1) {
    throw createError({ statusCode: 400, statusMessage: 'networkId required' })
  }
  await requireInternalSyncAuth(event, networkId)
  return runInternalAriWrite(networkId)
})
