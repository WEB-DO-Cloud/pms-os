import { principalCanAccessModule } from '@pms/auth'
import {
  findAiProposal,
  updateAiProposalStatus,
} from '../../../../lib/ai-proposals'
import { toHttpError } from '../../../../utils/ai'
import { requirePrincipal } from '../../../../utils/auth'
import { parseNetworkId } from '../../../../utils/integrations'

/** POST /api/ai/pricing/:id/accept — mark as accepted local draft (no ARI push). */
export default defineEventHandler(async (event) => {
  try {
    const id = getRouterParam(event, 'id')
    const body = await readBody<{ networkId: number; note?: string }>(event)
    const networkId = parseNetworkId(body.networkId)
    const { principal } = await requirePrincipal(event, networkId)
    if (!principalCanAccessModule(principal, 'rates')) {
      throw createError({ statusCode: 403, statusMessage: 'Module denied' })
    }
    if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

    const existing = findAiProposal(networkId, id)
    if (!existing || existing.kind !== 'pricing') {
      throw createError({ statusCode: 404, statusMessage: 'Proposal not found' })
    }

    const proposal = updateAiProposalStatus(
      networkId,
      id,
      'accepted_local',
      body.note ?? 'Accepted as local draft — not pushed to Channex',
    )

    return {
      proposal,
      ariWriteEnabled: false,
      note: 'Accepted locally only. Channex ARI write-back is not enabled.',
    }
  } catch (err) {
    throw toHttpError(err)
  }
})
