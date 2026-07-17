import { requirePrincipal } from '../../../utils/auth'
import { parseNetworkId } from '../../../utils/integrations'
import { patchAutomationRule } from '../../../utils/automation'
import type { AutomationAction, AutomationCondition, AutomationTrigger } from '@pms/domain'

/** PATCH /api/automation/rules/:id */
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid rule id' })
  }
  const body = await readBody<{
    networkId: number
    name?: string
    trigger?: AutomationTrigger
    conditions?: AutomationCondition | null
    actions?: AutomationAction[]
    isActive?: boolean
  }>(event)
  const networkId = parseNetworkId(body.networkId)
  const { principal } = await requirePrincipal(event, networkId)
  const rule = patchAutomationRule(principal, id, {
    name: body.name,
    trigger: body.trigger,
    conditions: body.conditions,
    actions: body.actions,
    isActive: body.isActive,
  })
  return { rule }
})
