import { principalCanAccessModule } from '@pms/auth'
import { isAiEnabled, toHttpError } from '../../utils/ai'
import { requirePrincipal } from '../../utils/auth'
import { parseNetworkId } from '../../utils/integrations'

/** GET /api/ai/status?networkId= — whether AI features are configured. */
export default defineEventHandler(async (event) => {
  try {
    const q = getQuery(event)
    const networkId = parseNetworkId(q.networkId)
    const { principal } = await requirePrincipal(event, networkId)
    const modules = {
      rates: principalCanAccessModule(principal, 'rates'),
      reports: principalCanAccessModule(principal, 'reports'),
      inbox: principalCanAccessModule(principal, 'inbox'),
      tasks: principalCanAccessModule(principal, 'tasks'),
    }
    return {
      networkId,
      enabled: isAiEnabled(),
      model: process.env.XAI_MODEL?.trim() || 'grok-4.5',
      provider: 'xai',
      modules,
      ariWriteEnabled: false,
      autoSendGuestMessages: false,
    }
  } catch (err) {
    throw toHttpError(err)
  }
})
