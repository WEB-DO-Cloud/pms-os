import { parseNetworkId, requireIntegrationsAccess } from '../../utils/integrations'
import { runInternalMessagePull } from '../../utils/sync'

/** POST /api/inbox/sync — pull OTA chat threads/messages from Channex now. */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ networkId: number }>(event)
  const networkId = parseNetworkId(body.networkId)
  await requireIntegrationsAccess(event, networkId)

  const result = await runInternalMessagePull(networkId)
  return { result }
})
