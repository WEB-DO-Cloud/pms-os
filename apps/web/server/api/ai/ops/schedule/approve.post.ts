import { principalCanAccessModule, principalCanAccessProperty } from '@pms/auth'
import {
  findAiProposal,
  opsScheduleSchema,
  updateAiProposalStatus,
  type OpsSchedulePayload,
} from '../../../../lib/ai-proposals'
import { toHttpError } from '../../../../utils/ai'
import { requirePrincipal } from '../../../../utils/auth'
import { parseNetworkId } from '../../../../utils/integrations'
import { requireOpsModule, runOpsCommand } from '../../../../utils/operations'

/**
 * POST /api/ai/ops/schedule/approve
 * Create selected tasks via domain createTask command.
 */
export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<{
      networkId: number
      proposalId: string
      /** Indexes into proposal.tasks; omit to approve all. */
      indexes?: number[]
    }>(event)
    const networkId = parseNetworkId(body.networkId)
    const { principal } = await requirePrincipal(event, networkId)
    requireOpsModule(principal, 'tasks')
    if (!principalCanAccessModule(principal, 'tasks')) {
      throw createError({ statusCode: 403, statusMessage: 'Module denied' })
    }

    const proposal = findAiProposal(networkId, body.proposalId)
    if (!proposal || proposal.kind !== 'ops_schedule') {
      throw createError({ statusCode: 404, statusMessage: 'Proposal not found' })
    }
    if (proposal.status !== 'pending') {
      throw createError({
        statusCode: 400,
        statusMessage: `Proposal already ${proposal.status}`,
      })
    }

    const parsed = opsScheduleSchema.parse(proposal.payload) as OpsSchedulePayload
    // Omit indexes → approve all; explicit [] → create none.
    const indexes =
      body.indexes === undefined
        ? parsed.tasks.map((_, i) => i)
        : body.indexes

    const created: unknown[] = []
    for (const i of indexes) {
      const item = parsed.tasks[i]
      if (!item) continue
      if (!principalCanAccessProperty(principal, item.propertyId)) {
        throw createError({
          statusCode: 403,
          statusMessage: `Property ${item.propertyId} out of scope`,
        })
      }
      const result = await runOpsCommand('createTask', principal, item.propertyId, {
        title: item.title,
        propertyId: item.propertyId,
        category: item.category,
        description: [item.rationale, item.dueHint ? `Due hint: ${item.dueHint}` : null]
          .filter(Boolean)
          .join('\n'),
        reservationId: item.reservationId ?? undefined,
      })
      created.push(result.data)
    }

    const updated = updateAiProposalStatus(
      networkId,
      proposal.id,
      'applied',
      `Created ${created.length} task(s)`,
    )

    return { proposal: updated, tasks: created }
  } catch (err) {
    throw toHttpError(err)
  }
})
