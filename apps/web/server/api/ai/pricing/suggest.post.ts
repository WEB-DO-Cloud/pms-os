import { principalCanAccessModule } from '@pms/auth'
import {
  createAiProposal,
  pricingSuggestionSchema,
} from '../../../lib/ai-proposals'
import { requireAiEnabled, runStructuredPrompt, toHttpError } from '../../../utils/ai'
import { buildPricingContext } from '../../../utils/ai-context'
import { requirePrincipal } from '../../../utils/auth'
import { parseNetworkId } from '../../../utils/integrations'

/** POST /api/ai/pricing/suggest — yield suggestions only; never queues ARI writes. */
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
        'Do not claim rates were pushed to any channel; these are drafts until a manager approves.',
        'Keep rationales short and operational.',
      ].join(' '),
      prompt: JSON.stringify({
        brief: body.brief ?? null,
        context: ctx,
      }),
    })

    // Drop suggestions for out-of-scope properties; stamp currency from context plans.
    const allowed = new Set(ctx.properties.map((p) => p.id))
    const currencyByPlan = new Map(
      ctx.plans.map((p) => [`${p.propertyId}:${p.ratePlanId}`, p.currency] as const),
    )
    const suggestions = object.suggestions
      .filter((s) => allowed.has(s.propertyId))
      .map((s) => ({
        ...s,
        currency:
          s.currency ??
          currencyByPlan.get(`${s.propertyId}:${s.ratePlanId}`) ??
          undefined,
      }))

    const note = ctx.aiApplyEnabled
      ? 'Suggestions are drafts. Approve selected rows to enqueue the same rate commands as the manual editor — not sent until the outbox reconciles.'
      : 'Suggestions are local drafts only — not pushed to Channex ARI.'

    const filtered = {
      suggestions,
      baseSnapshotVersion: ctx.baseSnapshotVersion,
      propertyIds: ctx.propertyIds,
      aiApplyEnabled: ctx.aiApplyEnabled,
      ariWriteEnabled: false as const,
      note,
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
