import { CAPABILITY_KEYS, type CapabilityKey } from '@pms/domain'
import { requirePrincipal } from '../../utils/auth'
import { parseNetworkId } from '../../utils/integrations'
import { runOpsCommand } from '../../utils/operations'
import { ensureSecretsHydrated } from '../../utils/sync'
import { getDb } from '../../utils/auth'

/** POST /api/settings/capabilities — org-admin toggle for one write class (R21). */
export default defineEventHandler(async (event) => {
  const body = await readBody<{
    networkId: number
    capability: CapabilityKey
    enabled: boolean
  }>(event)
  const networkId = parseNetworkId(body.networkId)
  const { principal } = await requirePrincipal(event, networkId)
  if (!CAPABILITY_KEYS.includes(body.capability)) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown capability' })
  }
  await ensureSecretsHydrated(networkId)

  const result = await runOpsCommand('setNetworkCapability', principal, undefined, {
    capability: body.capability,
    enabled: body.enabled === true,
  })

  // Durable before reported: gates must survive restart (R15/KTD7).
  if (process.env.DATABASE_URL) {
    const { persistNetworkCapabilities } = await import('../../lib/ari-persistence')
    await persistNetworkCapabilities(getDb(), result.data!)
  }

  return { capabilities: result.data }
})
