import type { TaskCategory } from '../store'

/** First-catalog triggers (U11). LLM/MCP deferred. */
export const AUTOMATION_TRIGGERS = [
  'booking_created',
  'booking_modified',
  'booking_cancelled',
  'check_in_day',
  'check_out_day',
  'task_status_changed',
  'sync_failure',
] as const

export type AutomationTrigger = (typeof AUTOMATION_TRIGGERS)[number]

export type AutomationCondition = {
  propertyIds?: number[]
  channel?: string | readonly string[]
  status?: string | readonly string[]
}

export type CreateTaskAction = {
  type: 'createTask'
  title: string
  category?: TaskCategory
  description?: string
}

export type NotifyStaffAction = {
  type: 'notifyStaff'
  message: string
}

export type QueueGuestMessageAction = {
  type: 'queueGuestMessage'
  body: string
  channel?: string
}

export type AutomationAction =
  | CreateTaskAction
  | NotifyStaffAction
  | QueueGuestMessageAction

export type AutomationRuleRecord = {
  id: number
  networkId: number
  name: string
  trigger: AutomationTrigger
  conditions: AutomationCondition | null
  actions: AutomationAction[]
  isActive: boolean
  /** Bumps on every rule mutation; stamped onto runs for auditability. */
  version: number
  createdByUserId: string | null
  createdAt: string
  updatedAt: string
}

export const AUTOMATION_RUN_STATUSES = [
  'queued',
  'running',
  'awaiting_approval',
  'succeeded',
  'partial_failure',
  'failed',
  'cancelled',
  'retry_queued',
] as const

export type AutomationRunStatus = (typeof AUTOMATION_RUN_STATUSES)[number]

export type AutomationEvent = {
  type: AutomationTrigger
  networkId: number
  /** Stable key for run-level idempotency (revision id, task transition id, …). */
  eventKey: string
  propertyId?: number
  reservationId?: number
  taskId?: number
  channel?: string | null
  status?: string | null
  payload?: Record<string, unknown>
}

export type ActionAttemptStatus =
  | 'ok'
  | 'awaiting_approval'
  | 'rejected'
  | 'dry_run'
  | 'skipped'
  | 'pending'

export type ActionAttempt = {
  index: number
  type: AutomationAction['type']
  commandName: string
  status: ActionAttemptStatus
  approvalId?: string
  error?: string
  data?: unknown
  auditId?: string | number
  idempotentReplay?: boolean
}

export type AutomationRunRecord = {
  id: number
  networkId: number
  ruleId: number
  ruleVersion: number
  status: AutomationRunStatus
  inputEvent: AutomationEvent
  conditionMatched: boolean
  conditionDetail: string | null
  actionsAttempted: ActionAttempt[]
  /** Next action index to execute (resume / retry). */
  nextActionIndex: number
  idempotencyKey: string
  dryRun: boolean
  startedAt: string
  finishedAt: string | null
}
