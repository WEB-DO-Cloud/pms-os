import {
  buildAutomationPrincipal,
  type CommandDeps,
  type DomainStore,
} from '../store'
import { runCommand } from '../run'
import type { CommandName } from '../commands'
import { evaluateConditions } from './conditions'
import type {
  ActionAttempt,
  AutomationAction,
  AutomationEvent,
  AutomationRuleRecord,
  AutomationRunRecord,
  AutomationRunStatus,
} from './types'

const TERMINAL_OK: AutomationRunStatus[] = [
  'succeeded',
  'awaiting_approval',
  'cancelled',
]

function runKey(rule: AutomationRuleRecord, event: AutomationEvent): string {
  return `auto:${rule.id}:v${rule.version}:${event.eventKey}`
}

function actionKey(runIdempotencyKey: string, index: number): string {
  return `${runIdempotencyKey}:action:${index}`
}

function resolvePropertyId(
  event: AutomationEvent,
  store: DomainStore,
): number | undefined {
  if (event.propertyId != null) return event.propertyId
  if (event.reservationId != null) {
    return store.reservations.find(
      (r) => r.id === event.reservationId && r.networkId === event.networkId,
    )?.propertyId
  }
  return undefined
}

function mapActionToCommand(
  action: AutomationAction,
  event: AutomationEvent,
  propertyId: number,
): { name: CommandName; input: Record<string, unknown> } {
  switch (action.type) {
    case 'createTask':
      return {
        name: 'createTask',
        input: {
          title: action.title,
          propertyId,
          category: action.category ?? 'other',
          description: action.description,
          reservationId: event.reservationId,
        },
      }
    case 'notifyStaff':
      // Prefer staff note on reservation; otherwise a low-risk staff task.
      if (event.reservationId != null) {
        return {
          name: 'attachReservationNote',
          input: {
            reservationId: event.reservationId,
            propertyId,
            note: `[Automation] ${action.message}`,
          },
        }
      }
      return {
        name: 'createTask',
        input: {
          title: `[Notify] ${action.message}`,
          propertyId,
          category: 'other',
          description: action.message,
        },
      }
    case 'queueGuestMessage':
      if (event.reservationId == null) {
        throw Object.assign(
          new Error('queueGuestMessage requires reservationId on event'),
          { code: 'VALIDATION' },
        )
      }
      return {
        name: 'queueGuestMessage',
        input: {
          reservationId: event.reservationId,
          propertyId,
          body: action.body,
          channel: action.channel ?? 'email',
        },
      }
  }
}

function deriveStatus(attempts: ActionAttempt[], done: boolean): AutomationRunStatus {
  if (attempts.some((a) => a.status === 'awaiting_approval')) {
    return 'awaiting_approval'
  }
  const rejected = attempts.filter((a) => a.status === 'rejected')
  const okish = attempts.filter(
    (a) => a.status === 'ok' || a.status === 'dry_run' || a.status === 'skipped',
  )
  if (!done) return 'running'
  if (rejected.length === 0) return 'succeeded'
  if (okish.some((a) => a.status === 'ok' || a.status === 'dry_run')) {
    return 'partial_failure'
  }
  return 'failed'
}

async function executeFrom(
  run: AutomationRunRecord,
  rule: AutomationRuleRecord,
  deps: CommandDeps,
): Promise<AutomationRunRecord> {
  const store = deps.store
  const propertyId = resolvePropertyId(run.inputEvent, store)
  if (propertyId == null) {
    run.status = 'failed'
    run.finishedAt = new Date().toISOString()
    run.actionsAttempted.push({
      index: run.nextActionIndex,
      type: rule.actions[run.nextActionIndex]?.type ?? 'createTask',
      commandName: '—',
      status: 'rejected',
      error: 'Event missing property scope',
    })
    return run
  }

  run.status = 'running'
  const principal = buildAutomationPrincipal(run.networkId, rule.id, [
    propertyId,
  ])

  for (let i = run.nextActionIndex; i < rule.actions.length; i++) {
    const action = rule.actions[i]!
    let mapped: { name: CommandName; input: Record<string, unknown> }
    try {
      mapped = mapActionToCommand(action, run.inputEvent, propertyId)
    } catch (err) {
      const attempt: ActionAttempt = {
        index: i,
        type: action.type,
        commandName: '—',
        status: 'rejected',
        error: err instanceof Error ? err.message : 'Invalid action',
      }
      run.actionsAttempted.push(attempt)
      run.nextActionIndex = i + 1
      continue
    }

    const result = await runCommand(
      mapped.name,
      {
        principal,
        actorKind: 'automation',
        networkId: run.networkId,
        propertyId,
        idempotencyKey: actionKey(run.idempotencyKey, i),
        dryRun: run.dryRun,
      },
      mapped.input as never,
      deps,
    )

    const attempt: ActionAttempt = {
      index: i,
      type: action.type,
      commandName: mapped.name,
      status:
        result.status === 'ok'
          ? 'ok'
          : result.status === 'awaiting_approval'
            ? 'awaiting_approval'
            : result.status === 'dry_run'
              ? 'dry_run'
              : 'rejected',
      approvalId: result.approvalId,
      error: result.error?.message,
      data: result.data,
      auditId: result.auditId,
      idempotentReplay: result.idempotentReplay,
    }
    run.actionsAttempted.push(attempt)
    run.nextActionIndex = i + 1

    // High-risk hold: pause remaining actions until approval resumes the run.
    if (result.status === 'awaiting_approval') {
      run.status = 'awaiting_approval'
      return run
    }
  }

  run.status = deriveStatus(run.actionsAttempted, true)
  run.finishedAt = new Date().toISOString()
  return run
}

export type ProcessEventOptions = {
  dryRun?: boolean
  /** Limit to a single rule (manual test fire). */
  ruleId?: number
}

/**
 * Match active rules for an event, evaluate conditions, execute actions via runCommand.
 * Run-level + action-level idempotency keys prevent duplicate side effects on retry.
 */
export async function processAutomationEvent(
  event: AutomationEvent,
  deps: CommandDeps,
  opts: ProcessEventOptions = {},
): Promise<AutomationRunRecord[]> {
  const store = deps.store
  const rules = store.automationRules.filter(
    (r) =>
      r.networkId === event.networkId &&
      r.isActive &&
      r.trigger === event.type &&
      (opts.ruleId == null || r.id === opts.ruleId),
  )

  const runs: AutomationRunRecord[] = []
  for (const rule of rules) {
    runs.push(await runRule(rule, event, deps, opts.dryRun === true))
  }
  return runs
}

async function runRule(
  rule: AutomationRuleRecord,
  event: AutomationEvent,
  deps: CommandDeps,
  dryRun: boolean,
): Promise<AutomationRunRecord> {
  const store = deps.store
  const idempotencyKey = runKey(rule, event)
  const existing = store.automationRuns.find(
    (r) =>
      r.networkId === event.networkId && r.idempotencyKey === idempotencyKey,
  )

  if (existing) {
    if (TERMINAL_OK.includes(existing.status) || existing.status === 'running') {
      return existing
    }
    // Failed / partial / retry_queued → resume unfinished actions (command idempotency holds).
    existing.status = 'retry_queued'
    existing.finishedAt = null
    return executeFrom(existing, rule, deps)
  }

  const condition = evaluateConditions(rule.conditions, event)
  const now = new Date().toISOString()
  const run: AutomationRunRecord = {
    id: store.nextId('automation_run'),
    networkId: event.networkId,
    ruleId: rule.id,
    ruleVersion: rule.version,
    status: 'queued',
    inputEvent: event,
    conditionMatched: condition.matched,
    conditionDetail: condition.detail,
    actionsAttempted: [],
    nextActionIndex: 0,
    idempotencyKey,
    dryRun,
    startedAt: now,
    finishedAt: null,
  }
  store.automationRuns.push(run)

  if (!condition.matched) {
    run.status = 'succeeded'
    run.finishedAt = now
    return run
  }

  return executeFrom(run, rule, deps)
}

/**
 * After a held high-risk action is approved, continue remaining rule actions.
 */
export async function resumeAutomationRun(
  store: DomainStore,
  networkId: number,
  runId: number,
  deps?: CommandDeps,
): Promise<AutomationRunRecord> {
  const run = store.automationRuns.find(
    (r) => r.id === runId && r.networkId === networkId,
  )
  if (!run) {
    throw Object.assign(new Error('Run not found'), { code: 'NOT_FOUND' })
  }
  if (run.status !== 'awaiting_approval' && run.status !== 'retry_queued') {
    throw Object.assign(
      new Error(`Run status ${run.status} cannot resume`),
      { code: 'CONFLICT' },
    )
  }
  const rule = store.automationRules.find(
    (r) => r.id === run.ruleId && r.networkId === networkId,
  )
  if (!rule) {
    throw Object.assign(new Error('Rule not found'), { code: 'NOT_FOUND' })
  }

  for (const attempt of run.actionsAttempted) {
    if (attempt.status !== 'awaiting_approval' || !attempt.approvalId) continue
    const approval = store.pendingApprovals.find(
      (p) => p.id === attempt.approvalId && p.networkId === networkId,
    )
    if (approval?.status === 'approved') {
      attempt.status = 'ok'
    } else if (approval?.status === 'rejected') {
      attempt.status = 'rejected'
      attempt.error = 'Approval rejected'
      run.status = 'cancelled'
      run.finishedAt = new Date().toISOString()
      return run
    } else {
      throw Object.assign(
        new Error('Held action is still awaiting approval'),
        { code: 'CONFLICT' },
      )
    }
  }

  run.finishedAt = null
  return executeFrom(run, rule, deps ?? { store })
}

export async function retryAutomationRun(
  store: DomainStore,
  networkId: number,
  runId: number,
  deps?: CommandDeps,
): Promise<AutomationRunRecord> {
  const run = store.automationRuns.find(
    (r) => r.id === runId && r.networkId === networkId,
  )
  if (!run) {
    throw Object.assign(new Error('Run not found'), { code: 'NOT_FOUND' })
  }
  if (
    run.status !== 'failed' &&
    run.status !== 'partial_failure' &&
    run.status !== 'retry_queued'
  ) {
    throw Object.assign(
      new Error(`Run status ${run.status} is not retryable`),
      { code: 'CONFLICT' },
    )
  }
  const rule = store.automationRules.find(
    (r) => r.id === run.ruleId && r.networkId === networkId,
  )
  if (!rule) {
    throw Object.assign(new Error('Rule not found'), { code: 'NOT_FOUND' })
  }
  run.status = 'retry_queued'
  run.finishedAt = null
  return executeFrom(run, rule, deps ?? { store })
}
