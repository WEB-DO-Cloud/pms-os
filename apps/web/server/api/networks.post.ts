import { assertMultiNetwork } from '@pms/licensing'
import { requirePrincipal } from '../utils/auth'
import { isCommercialEdition } from '../utils/edition'
import { createAdditionalNetwork } from '../utils/provision-tenant'

type Body = {
  name?: string
  /** Network whose entitlements / defaults are copied. */
  sourceNetworkId?: number
}

/**
 * POST /api/networks — create another network for a multi-network org_admin.
 */
export default defineEventHandler(async (event) => {
  if (!isCommercialEdition()) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Additional networks are only available on commercial',
    })
  }

  const body = (await readBody(event).catch(() => ({}))) as Body
  const sourceNetworkId = Number(body.sourceNetworkId)
  if (!Number.isFinite(sourceNetworkId) || sourceNetworkId < 1) {
    throw createError({
      statusCode: 400,
      statusMessage: 'sourceNetworkId required',
    })
  }

  const { session, principal } = await requirePrincipal(event, sourceNetworkId)
  if (principal.networkId !== sourceNetworkId) {
    throw createError({ statusCode: 403, statusMessage: 'Network mismatch' })
  }
  try {
    assertMultiNetwork(principal.entitlements)
  } catch {
    throw createError({
      statusCode: 403,
      statusMessage: 'Multi-network is not enabled for this account',
    })
  }

  const network = await createAdditionalNetwork({
    userId: session.user.id,
    name: body.name ?? '',
    sourceNetworkId,
  })

  return { ok: true, network }
})
