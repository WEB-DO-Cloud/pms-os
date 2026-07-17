import { requirePrincipal } from '../../utils/auth'
import { parseNetworkId } from '../../utils/integrations'
import { fireAutomationEvent } from '../../utils/automation'
import type { AutomationEvent, AutomationTrigger } from '@pms/domain'

/** POST /api/automation/fire — manual / dry-run event against rules */
export default defineEventHandler(async (event) => {
  const body = await readBody<{
    networkId: number
    type: AutomationTrigger
    eventKey: string
    propertyId?: number
    reservationId?: number
    taskId?: number
    channel?: string | null
    status?: string | null
    dryRun?: boolean
    ruleId?: number
  }>(event)
  const networkId = parseNetworkId(body.networkId)
  const { principal } = await requirePrincipal(event, networkId)
  if (!body.eventKey?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'eventKey required' })
  }
  const payload: AutomationEvent = {
    type: body.type,
    networkId,
    eventKey: body.eventKey.trim(),
    propertyId: body.propertyId,
    reservationId: body.reservationId,
    taskId: body.taskId,
    channel: body.channel,
    status: body.status,
  }
  const runs = await fireAutomationEvent(principal, payload, {
    dryRun: body.dryRun === true,
    ruleId: body.ruleId,
  })
  return { runs }
})
