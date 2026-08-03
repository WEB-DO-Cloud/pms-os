import { principalCanAccessModule } from '@pms/auth'
import { createError } from 'h3'
import { requirePrincipal } from '../../utils/auth'
import { setCalendarDerivedModifier } from '../../utils/calendar-ari'
import { parseNetworkId } from '../../utils/integrations'

/** POST /api/calendar/derived-modifier — enqueue derived rate_plan modifier (U7 / AE7). */
export default defineEventHandler(async (event) => {
  const body = await readBody<{
    networkId: number
    propertyId: number
    ratePlanChannexId: string
    occupancy: number
    isPrimary?: boolean
    derivedOption: { rate: [string, string][] }
    baseSnapshotVersion: number
    compensatesIntentId?: number | null
    previewOnly?: boolean
  }>(event)
  const networkId = parseNetworkId(body.networkId)
  const { principal } = await requirePrincipal(event, networkId)
  if (
    !principalCanAccessModule(principal, 'calendar') &&
    !principalCanAccessModule(principal, 'rates')
  ) {
    throw createError({ statusCode: 403, statusMessage: 'Module denied' })
  }

  return setCalendarDerivedModifier(principal, {
    propertyId: Number(body.propertyId),
    ratePlanChannexId: String(body.ratePlanChannexId),
    occupancy: Number(body.occupancy),
    isPrimary: body.isPrimary,
    derivedOption: body.derivedOption,
    baseSnapshotVersion: Number(body.baseSnapshotVersion),
    compensatesIntentId: body.compensatesIntentId ?? null,
    previewOnly: body.previewOnly === true,
  })
})
