import { principalCanAccessModule } from '@pms/auth'
import {
  createAiProposal,
  conciergeDraftSchema,
} from '../../../lib/ai-proposals'
import { requireAiEnabled, runStructuredPrompt, toHttpError } from '../../../utils/ai'
import { buildConciergeContext } from '../../../utils/ai-context'
import { requirePrincipal } from '../../../utils/auth'
import { parseNetworkId } from '../../../utils/integrations'

/** POST /api/ai/concierge/draft — draft guest reply; staff must queue separately. */
export default defineEventHandler(async (event) => {
  try {
    requireAiEnabled()
    const body = await readBody<{
      networkId: number
      reservationId: number
      brief?: string
    }>(event)
    const networkId = parseNetworkId(body.networkId)
    const { principal } = await requirePrincipal(event, networkId)
    if (!principalCanAccessModule(principal, 'inbox')) {
      throw createError({ statusCode: 403, statusMessage: 'Module denied' })
    }
    if (!Number.isFinite(body.reservationId)) {
      throw createError({ statusCode: 400, statusMessage: 'reservationId required' })
    }

    const ctx = buildConciergeContext(networkId, principal, body.reservationId)
    const { object } = await runStructuredPrompt({
      schema: conciergeDraftSchema,
      system: [
        'You are a polite hotel/vacation-rental guest concierge.',
        'Draft a short outbound guest message. Do not invent confirmations, refunds, or policy changes.',
        'If unsure, add a caution note for staff. Never claim the message was sent.',
      ].join(' '),
      prompt: JSON.stringify({
        brief: body.brief ?? null,
        context: ctx,
      }),
    })

    const proposal = createAiProposal({
      networkId,
      kind: 'concierge',
      payload: {
        ...object,
        reservationId: body.reservationId,
        propertyId: ctx.reservation.propertyId,
      },
      createdByUserId: principal.userId,
    })

    return {
      proposal,
      draft: object,
      reservation: ctx.reservation,
      autoSend: false,
      note: 'Draft only — queue via Inbox to send through the outbound path.',
    }
  } catch (err) {
    throw toHttpError(err)
  }
})
