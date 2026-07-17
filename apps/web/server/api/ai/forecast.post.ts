import { principalCanAccessModule } from '@pms/auth'
import {
  createAiProposal,
  forecastSchema,
} from '../../lib/ai-proposals'
import { requireAiEnabled, runStructuredPrompt, toHttpError } from '../../utils/ai'
import { buildForecastContext } from '../../utils/ai-context'
import { requirePrincipal } from '../../utils/auth'
import { parseNetworkId } from '../../utils/integrations'

/** POST /api/ai/forecast — AI occupancy/revenue outlook from local reports. */
export default defineEventHandler(async (event) => {
  try {
    requireAiEnabled()
    const body = await readBody<{
      networkId: number
      from: string
      to: string
      propertyId?: number
      horizonDays?: number
    }>(event)
    const networkId = parseNetworkId(body.networkId)
    const { principal } = await requirePrincipal(event, networkId)
    if (!principalCanAccessModule(principal, 'reports')) {
      throw createError({ statusCode: 403, statusMessage: 'Module denied' })
    }
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(body.from ?? '') ||
      !/^\d{4}-\d{2}-\d{2}$/.test(body.to ?? '')
    ) {
      throw createError({
        statusCode: 400,
        statusMessage: 'from and to required as YYYY-MM-DD',
      })
    }

    const ctx = buildForecastContext(
      networkId,
      principal,
      body.from,
      body.to,
      body.propertyId,
    )
    const horizonDays = body.horizonDays ?? 30

    const { object } = await runStructuredPrompt({
      schema: forecastSchema,
      system: [
        'You are a PMS revenue analyst.',
        'Produce a short forecast grounded in the provided occupancy/revenue summary.',
        'Use integer minor units for revenue. occupancyPct is 0-100.',
        'Call out sync staleness risks when freshness.stale is true.',
        `Target horizonDays ≈ ${horizonDays}.`,
      ].join(' '),
      prompt: JSON.stringify({ horizonDays, context: ctx }),
    })

    const proposal = createAiProposal({
      networkId,
      kind: 'forecast',
      payload: object,
      createdByUserId: principal.userId,
    })

    return {
      proposal,
      forecast: object,
      freshness: ctx.freshness,
    }
  } catch (err) {
    throw toHttpError(err)
  }
})
