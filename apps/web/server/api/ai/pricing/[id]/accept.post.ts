import { acceptPricingProposal } from '../../../../utils/ai-pricing'
import { toHttpError } from '../../../../utils/ai'
import { requirePrincipal } from '../../../../utils/auth'
import { parseNetworkId } from '../../../../utils/integrations'

/**
 * POST /api/ai/pricing/:id/accept
 * aiApply off → local draft. aiApply on → manager-approved setRatePlanNightlyRates enqueue.
 */
export default defineEventHandler(async (event) => {
  try {
    const id = getRouterParam(event, 'id')
    const body = await readBody<{
      networkId: number
      note?: string
      /** Indexes into proposal.suggestions; omit = all; [] = apply nothing. */
      indexes?: number[]
    }>(event)
    const networkId = parseNetworkId(body.networkId)
    const { principal } = await requirePrincipal(event, networkId)
    if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

    const result = await acceptPricingProposal(principal, {
      networkId,
      proposalId: id,
      indexes: body.indexes,
      note: body.note,
    })

    return {
      proposal: result.proposal,
      /** HTTP handler never sends to Channex; worker drains outbox. */
      ariWriteEnabled: false,
      aiApplyEnabled: result.aiApplyEnabled,
      appliedViaCommands: result.appliedViaCommands,
      outcomes: result.outcomes,
      note: result.note,
    }
  } catch (err) {
    throw toHttpError(err)
  }
})
