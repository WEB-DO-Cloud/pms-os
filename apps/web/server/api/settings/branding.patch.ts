import { principalCanPerformAction } from '@pms/auth'
import { requirePrincipal } from '../../utils/auth'
import { parseNetworkId } from '../../utils/integrations'
import { saveNetworkBranding } from '../../utils/branding'

/** PATCH /api/settings/branding — white-label only; fail closed without entitlement. */
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const body = await readBody<{
    networkId?: number
    displayName?: string | null
    logoUrl?: string | null
    accentColor?: string | null
  }>(event)
  const networkId = parseNetworkId(body?.networkId ?? q.networkId)
  const { principal } = await requirePrincipal(event, networkId)

  if (
    !principalCanPerformAction(principal, 'licensing') &&
    principal.role !== 'manager'
  ) {
    throw createError({ statusCode: 403, statusMessage: 'Branding settings denied' })
  }

  try {
    const branding = await saveNetworkBranding(principal.entitlements, {
      networkId,
      displayName: body?.displayName,
      logoUrl: body?.logoUrl,
      accentColor: body?.accentColor,
    })
    return { enabled: true, branding }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Branding update failed'
    const commercial = /white.?label|commercial/i.test(message)
    throw createError({
      statusCode: commercial ? 403 : 400,
      statusMessage: message,
    })
  }
})
