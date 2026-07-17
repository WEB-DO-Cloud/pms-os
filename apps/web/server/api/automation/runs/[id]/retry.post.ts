import { requirePrincipal } from '../../../../utils/auth'
import { parseNetworkId } from '../../../../utils/integrations'
import { retryRun } from '../../../../utils/automation'

/** POST /api/automation/runs/:id/retry */
export default defineEventHandler(async (event) => {
  const runId = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(runId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid run id' })
  }
  const body = await readBody<{ networkId: number }>(event)
  const networkId = parseNetworkId(body.networkId)
  const { principal } = await requirePrincipal(event, networkId)
  const run = await retryRun(principal, runId)
  return { run }
})
