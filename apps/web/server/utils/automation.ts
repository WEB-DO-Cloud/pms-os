import {
  principalCanAccessModule,
  principalCanPerformAction,
  type PrincipalContext,
} from '@pms/auth'
import {
  createRule,
  listRules,
  listRuns,
  processAutomationEvent,
  resumeAutomationRun,
  retryAutomationRun,
  runCommand,
  updateRule,
  type AutomationAction,
  type AutomationCondition,
  type AutomationEvent,
  type AutomationTrigger,
} from '@pms/domain'
import { commandCtx, getDomainStore } from './reservations'

/**
 * Automation module API helpers (U11).
 *
 * ponytail: rules/runs live on in-process DomainStore (same ceiling as U8/U9).
 * PG tables automation_rules/automation_runs exist — hydrate/write-through later.
 */

export function requireAutomationModule(principal: PrincipalContext) {
  if (!principalCanAccessModule(principal, 'automation')) {
    throw createError({ statusCode: 403, statusMessage: 'Module denied' })
  }
}

export function requireAutomationApproval(principal: PrincipalContext) {
  if (!principalCanPerformAction(principal, 'automation_approval')) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Automation approval denied',
    })
  }
}

export function listAutomationRules(networkId: number) {
  return listRules(getDomainStore(networkId), networkId)
}

export function listAutomationRuns(
  networkId: number,
  opts: { ruleId?: number; limit?: number } = {},
) {
  return listRuns(getDomainStore(networkId), networkId, opts)
}

export function createAutomationRule(
  principal: PrincipalContext,
  input: {
    name: string
    trigger: AutomationTrigger
    conditions?: AutomationCondition | null
    actions: AutomationAction[]
    isActive?: boolean
  },
) {
  requireAutomationModule(principal)
  if (principal.networkId == null) {
    throw createError({ statusCode: 403, statusMessage: 'Network required' })
  }
  try {
    return createRule(getDomainStore(principal.networkId), {
      networkId: principal.networkId,
      name: input.name,
      trigger: input.trigger,
      conditions: input.conditions,
      actions: input.actions,
      isActive: input.isActive,
      createdByUserId: principal.userId,
    })
  } catch (err) {
    throw createError({
      statusCode: 400,
      statusMessage: err instanceof Error ? err.message : 'Invalid rule',
    })
  }
}

export function patchAutomationRule(
  principal: PrincipalContext,
  ruleId: number,
  patch: Partial<{
    name: string
    trigger: AutomationTrigger
    conditions: AutomationCondition | null
    actions: AutomationAction[]
    isActive: boolean
  }>,
) {
  requireAutomationModule(principal)
  if (principal.networkId == null) {
    throw createError({ statusCode: 403, statusMessage: 'Network required' })
  }
  try {
    return updateRule(
      getDomainStore(principal.networkId),
      principal.networkId,
      ruleId,
      patch,
    )
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? String((err as { code: string }).code)
        : ''
    throw createError({
      statusCode: code === 'NOT_FOUND' ? 404 : 400,
      statusMessage: err instanceof Error ? err.message : 'Invalid rule',
    })
  }
}

export async function fireAutomationEvent(
  principal: PrincipalContext,
  event: AutomationEvent,
  opts: { dryRun?: boolean; ruleId?: number } = {},
) {
  requireAutomationModule(principal)
  if (principal.networkId == null || principal.networkId !== event.networkId) {
    throw createError({ statusCode: 403, statusMessage: 'Network required' })
  }
  return processAutomationEvent(event, { store: getDomainStore(event.networkId) }, opts)
}

export async function approveHeldAction(
  principal: PrincipalContext,
  approvalId: string,
  propertyId?: number,
) {
  requireAutomationApproval(principal)
  if (principal.networkId == null) {
    throw createError({ statusCode: 403, statusMessage: 'Network required' })
  }
  const store = getDomainStore(principal.networkId)
  const result = await runCommand(
    'approveAutomationAction',
    commandCtx(principal, propertyId),
    { approvalId },
    { store },
  )
  if (result.status !== 'ok') {
    throw createError({
      statusCode: result.error?.code === 'NOT_FOUND' ? 404 : 400,
      statusMessage: result.error?.message ?? 'Approval failed',
      data: result,
    })
  }

  // Resume any run waiting on this approval
  const run = store.automationRuns.find(
    (r) =>
      r.networkId === principal.networkId &&
      r.status === 'awaiting_approval' &&
      r.actionsAttempted.some((a) => a.approvalId === approvalId),
  )
  let resumed = null
  if (run) {
    resumed = await resumeAutomationRun(store, principal.networkId, run.id)
  }
  return { approval: result.data, run: resumed }
}

export async function retryRun(principal: PrincipalContext, runId: number) {
  requireAutomationModule(principal)
  if (principal.networkId == null) {
    throw createError({ statusCode: 403, statusMessage: 'Network required' })
  }
  try {
    return await retryAutomationRun(
      getDomainStore(principal.networkId),
      principal.networkId,
      runId,
    )
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? String((err as { code: string }).code)
        : ''
    throw createError({
      statusCode: code === 'NOT_FOUND' ? 404 : 400,
      statusMessage: err instanceof Error ? err.message : 'Retry failed',
    })
  }
}

export function listPendingApprovals(networkId: number) {
  return getDomainStore(networkId).pendingApprovals.filter(
    (a) => a.networkId === networkId && a.status === 'awaiting_approval',
  )
}
