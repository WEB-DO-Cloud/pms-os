import type { DomainStore } from '../store'
import type {
  AutomationAction,
  AutomationCondition,
  AutomationRuleRecord,
  AutomationTrigger,
} from './types'
import { AUTOMATION_TRIGGERS } from './types'

export type UpsertRuleInput = {
  networkId: number
  name: string
  trigger: AutomationTrigger
  conditions?: AutomationCondition | null
  actions: AutomationAction[]
  isActive?: boolean
  createdByUserId?: string | null
}

function assertTrigger(trigger: string): asserts trigger is AutomationTrigger {
  if (!(AUTOMATION_TRIGGERS as readonly string[]).includes(trigger)) {
    throw Object.assign(new Error(`Unknown trigger: ${trigger}`), {
      code: 'VALIDATION',
    })
  }
}

function assertActions(actions: AutomationAction[]) {
  if (!Array.isArray(actions) || actions.length === 0) {
    throw Object.assign(new Error('At least one action required'), {
      code: 'VALIDATION',
    })
  }
  for (const a of actions) {
    if (a.type === 'createTask' && !a.title?.trim()) {
      throw Object.assign(new Error('createTask requires title'), {
        code: 'VALIDATION',
      })
    }
    if (a.type === 'notifyStaff' && !a.message?.trim()) {
      throw Object.assign(new Error('notifyStaff requires message'), {
        code: 'VALIDATION',
      })
    }
    if (a.type === 'queueGuestMessage' && !a.body?.trim()) {
      throw Object.assign(new Error('queueGuestMessage requires body'), {
        code: 'VALIDATION',
      })
    }
  }
}

export function createRule(
  store: DomainStore,
  input: UpsertRuleInput,
): AutomationRuleRecord {
  assertTrigger(input.trigger)
  assertActions(input.actions)
  if (!input.name?.trim()) {
    throw Object.assign(new Error('Rule name required'), { code: 'VALIDATION' })
  }
  const now = new Date().toISOString()
  const rule: AutomationRuleRecord = {
    id: store.nextId('automation_rule'),
    networkId: input.networkId,
    name: input.name.trim(),
    trigger: input.trigger,
    conditions: input.conditions ?? null,
    actions: input.actions,
    isActive: input.isActive !== false,
    version: 1,
    createdByUserId: input.createdByUserId ?? null,
    createdAt: now,
    updatedAt: now,
  }
  store.automationRules.push(rule)
  return rule
}

export function updateRule(
  store: DomainStore,
  networkId: number,
  ruleId: number,
  patch: Partial<
    Pick<
      UpsertRuleInput,
      'name' | 'trigger' | 'conditions' | 'actions' | 'isActive'
    >
  >,
): AutomationRuleRecord {
  const rule = store.automationRules.find(
    (r) => r.id === ruleId && r.networkId === networkId,
  )
  if (!rule) {
    throw Object.assign(new Error('Rule not found'), { code: 'NOT_FOUND' })
  }
  if (patch.trigger != null) assertTrigger(patch.trigger)
  if (patch.actions != null) assertActions(patch.actions)
  if (patch.name != null) {
    if (!patch.name.trim()) {
      throw Object.assign(new Error('Rule name required'), {
        code: 'VALIDATION',
      })
    }
    rule.name = patch.name.trim()
  }
  if (patch.trigger != null) rule.trigger = patch.trigger
  if (patch.conditions !== undefined) rule.conditions = patch.conditions ?? null
  if (patch.actions != null) rule.actions = patch.actions
  if (patch.isActive != null) rule.isActive = patch.isActive
  rule.version += 1
  rule.updatedAt = new Date().toISOString()
  return rule
}

export function listRules(
  store: DomainStore,
  networkId: number,
): AutomationRuleRecord[] {
  return store.automationRules.filter((r) => r.networkId === networkId)
}

export function listRuns(
  store: DomainStore,
  networkId: number,
  opts: { ruleId?: number; limit?: number } = {},
) {
  let rows = store.automationRuns.filter((r) => r.networkId === networkId)
  if (opts.ruleId != null) {
    rows = rows.filter((r) => r.ruleId === opts.ruleId)
  }
  rows = [...rows].sort((a, b) => b.id - a.id)
  if (opts.limit != null) rows = rows.slice(0, opts.limit)
  return rows
}
