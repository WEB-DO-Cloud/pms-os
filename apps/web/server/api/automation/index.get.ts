import { requirePrincipal } from '../../utils/auth'
import { parseNetworkId } from '../../utils/integrations'
import {
  listAutomationRules,
  listAutomationRuns,
  listPendingApprovals,
  requireAutomationModule,
} from '../../utils/automation'
import { AUTOMATION_TRIGGERS } from '@pms/domain'

/** GET /api/automation — rules, recent runs, pending approvals, trigger catalog */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const networkId = parseNetworkId(query.networkId)
  const { principal } = await requirePrincipal(event, networkId)
  requireAutomationModule(principal)

  const ruleId =
    query.ruleId != null && query.ruleId !== ''
      ? Number(query.ruleId)
      : undefined

  return {
    triggers: AUTOMATION_TRIGGERS,
    rules: listAutomationRules(networkId),
    runs: listAutomationRuns(networkId, {
      ruleId: Number.isFinite(ruleId) ? ruleId : undefined,
      limit: 50,
    }),
    pendingApprovals: listPendingApprovals(networkId),
  }
})
