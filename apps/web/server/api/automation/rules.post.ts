import { requirePrincipal } from '../../utils/auth'
import { parseNetworkId } from '../../utils/integrations'
import { createAutomationRule } from '../../utils/automation'
import type { AutomationAction, AutomationCondition, AutomationTrigger } from '@pms/domain'

/** POST /api/automation/rules — create rule */
export default defineEventHandler(async (event) => {
  const body = await readBody<{
    networkId: number
    name: string
    trigger: AutomationTrigger
    conditions?: AutomationCondition | null
    actions: AutomationAction[]
    isActive?: boolean
  }>(event)
  const networkId = parseNetworkId(body.networkId)
  const { principal } = await requirePrincipal(event, networkId)
  const rule = createAutomationRule(principal, {
    name: body.name,
    trigger: body.trigger,
    conditions: body.conditions,
    actions: body.actions,
    isActive: body.isActive,
  })
  return { rule }
})
