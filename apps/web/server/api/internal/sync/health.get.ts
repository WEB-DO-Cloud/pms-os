import { publicSyncHealth, requireInternalSyncAuth } from '../../../utils/sync'

/** GET /api/internal/sync/health?networkId=1 — manager/session or SYNC_INTERNAL_SECRET */
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const networkId = Number(q.networkId)
  if (!Number.isFinite(networkId) || networkId < 1) {
    throw createError({ statusCode: 400, statusMessage: 'networkId required' })
  }
  await requireInternalSyncAuth(event, networkId)
  const detail = getHeader(event, 'x-sync-include-errors') === '1'
  return publicSyncHealth(networkId, detail)
})
