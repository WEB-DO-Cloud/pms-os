import { principalCanAccessModule } from '@pms/auth'
import {
  createAiProposal,
  pricingSuggestionSchema,
} from '../../../lib/ai-proposals'
import { requireAiEnabled, runStructuredPrompt, toHttpError } from '../../../utils/ai'
import { buildPricingContext } from '../../../utils/ai-context'
import { requirePrincipal } from '../../../utils/auth'
import { parseNetworkId } from '../../../utils/integrations'

/** POST /api/ai/pricing/suggest — yield suggestions (local draft only; no ARI write). */
export default defineEventHandler(async (event) => {
  try {
    requireAiEnabled()
    const body = await readBody<{
      networkId: number
      propertyId?: number
      brief?: string
    }>(event)
    const networkId = parseNetworkId(body.networkId)
    const { principal } = await requirePrincipal(event, networkId)
    if (!principalCanAccessModule(principal, 'rates')) {
      throw createError({ statusCode: 403, statusMessage: 'Module denied' })
    }

    const ctx = buildPricingContext(networkId, principal, body.propertyId)
    const { object } = await runStructuredPrompt({
      schema: pricingSuggestionSchema,
      system: [
        'You are a hotel/vacation-rental yield manager.',
        'Suggest nightly rates in integer minor units (cents).',
        'Only use propertyIds and ratePlanIds from the provided context.',
        'Do not claim rates were pushed to any channel; these are local drafts.',
        'Keep rationales short and operational.',
      ].join(' '),
      prompt: JSON.stringify({
        brief: body.brief ?? null,
        context: ctx,
      }),
    })

    // Drop suggestions for out-of-scope properties.
    const allowed = new Set(ctx.properties.map((p) => p.id))
    const filtered = {
      suggestions: object.suggestions.filter((s) => allowed.has(s.propertyId)),
      ariWriteEnabled: false as const,
      note: 'Suggestions are local drafts only — not pushed to Channex ARI.',
    }

    const proposal = createAiProposal({
      networkId,
      kind: 'pricing',
      payload: filtered,
      createdByUserId: principal.userId,
    })

    return { proposal, ...filtered }
  } catch (err) {
    throw toHttpError(err)
  }
})
