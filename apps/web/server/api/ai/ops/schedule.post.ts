import { principalCanAccessModule } from '@pms/auth'
import {
  createAiProposal,
  opsScheduleSchema,
} from '../../../lib/ai-proposals'
import { requireAiEnabled, runStructuredPrompt, toHttpError } from '../../../utils/ai'
import { buildOpsScheduleContext } from '../../../utils/ai-context'
import { requirePrincipal } from '../../../utils/auth'
import { parseNetworkId } from '../../../utils/integrations'

/** POST /api/ai/ops/schedule — propose HK/maintenance tasks for staff approval. */
export default defineEventHandler(async (event) => {
  try {
    requireAiEnabled()
    const body = await readBody<{
      networkId: number
      from: string
      to: string
      propertyId?: number
    }>(event)
    const networkId = parseNetworkId(body.networkId)
    const { principal } = await requirePrincipal(event, networkId)
    if (!principalCanAccessModule(principal, 'tasks')) {
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

    const ctx = buildOpsScheduleContext(
      networkId,
      principal,
      body.from,
      body.to,
      body.propertyId,
    )
    const allowed = new Set(ctx.properties.map((p) => p.id))

    const { object } = await runStructuredPrompt({
      schema: opsScheduleSchema,
      system: [
        'You are a property operations planner for housekeeping and maintenance.',
        'Propose tasks only for cleaning, maintenance, or inspection.',
        'Use only propertyIds from context. Prefer check-out days for cleaning.',
        'Do not create tasks yourself — staff will approve.',
      ].join(' '),
      prompt: JSON.stringify({ context: ctx }),
    })

    const filtered = {
      tasks: object.tasks.filter((t) => allowed.has(t.propertyId)),
    }

    const proposal = createAiProposal({
      networkId,
      kind: 'ops_schedule',
      payload: filtered,
      createdByUserId: principal.userId,
    })

    return { proposal, ...filtered }
  } catch (err) {
    throw toHttpError(err)
  }
})
