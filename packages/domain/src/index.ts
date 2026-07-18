import type { ActorKind, CommandContext } from './context'
import {
  assertActorKindAllowed,
  assertModuleAccess,
  assertNetworkScope,
  assertPrivilegedAction,
  assertPropertyScope,
  ACTOR_KINDS,
} from './context'
import { buildAuditEvent, type AuditEventRecord, type AuditWriteInput } from './audit'
import type { CommandRiskMeta, CompensatingAction, RiskLevel } from './risk'
import { COMPENSATING_ACTIONS, RISK_LEVELS } from './risk'
import type {
  CommandError,
  CommandErrorCode,
  CommandResult,
  CommandResultMeta,
  CommandStatus,
} from './result'
import { runCommand } from './run'
import {
  buildAutomationPrincipal,
  buildSyncPrincipal,
  createMemoryStore,
  defaultGates,
  type CommandDeps,
  type ConversationReadRecord,
  type DomainStore,
  type GateFns,
  type ChannelMessageRecord,
  type GuestRecord,
  type LedgerRecord,
  type OutboundMessageRecord,
  type PendingApprovalRecord,
  type PropertyOpsRecord,
  type ReservationRecord,
  type ReviewRecord,
  type ReviewStatus,
  type TaskCategory,
  type TaskRecord,
  type TaskStatus,
  type LedgerType,
} from './store'
import {
  commandRegistry,
  type CommandInputMap,
  type CommandName,
  type CommandOutputMap,
} from './commands'
import {
  filterMessagesForPrincipal,
  filterPropertyOpsActive,
  filterReviewsForPrincipal,
  filterTasksForPrincipal,
  guestKeyFromReservation,
  isPropertyArchived,
  projectGuestsForPrincipal,
} from './operations-query'
import {
  computeReportSummary,
  daysInclusive,
  formatMoneyMinor,
  isSyncDataStale,
  overlappingStayNights,
  stayNights,
} from './reports'
import { projectRatesReadOnly } from './rates'
import {
  AUTOMATION_RUN_STATUSES,
  AUTOMATION_TRIGGERS,
  createRule,
  evaluateConditions,
  listRules,
  listRuns,
  processAutomationEvent,
  resumeAutomationRun,
  retryAutomationRun,
  updateRule,
} from './automation'
import { assignPhysicalRoom, staysOverlap } from './assign-physical-room'

export const packageName = '@pms/domain' as const

export {
  // core
  runCommand,
  commandRegistry,
  createMemoryStore,
  buildSyncPrincipal,
  buildAutomationPrincipal,
  buildAuditEvent,
  assertNetworkScope,
  assertPropertyScope,
  assertModuleAccess,
  assertPrivilegedAction,
  assertActorKindAllowed,
  defaultGates,
  ACTOR_KINDS,
  RISK_LEVELS,
  COMPENSATING_ACTIONS,
  // operations projections (U9)
  filterTasksForPrincipal,
  filterMessagesForPrincipal,
  filterReviewsForPrincipal,
  filterPropertyOpsActive,
  isPropertyArchived,
  projectGuestsForPrincipal,
  guestKeyFromReservation,
  // revenue (U10)
  computeReportSummary,
  isSyncDataStale,
  formatMoneyMinor,
  stayNights,
  overlappingStayNights,
  daysInclusive,
  projectRatesReadOnly,
  // automation engine (U11)
  AUTOMATION_TRIGGERS,
  AUTOMATION_RUN_STATUSES,
  createRule,
  updateRule,
  listRules,
  listRuns,
  evaluateConditions,
  processAutomationEvent,
  resumeAutomationRun,
  retryAutomationRun,
  // physical room assignment
  assignPhysicalRoom,
  staysOverlap,
}

export type {
  ActorKind,
  CommandContext,
  CommandDeps,
  DomainStore,
  GateFns,
  CommandName,
  CommandInputMap,
  CommandOutputMap,
  CommandResult,
  CommandResultMeta,
  CommandStatus,
  CommandError,
  CommandErrorCode,
  CommandRiskMeta,
  CompensatingAction,
  RiskLevel,
  AuditEventRecord,
  AuditWriteInput,
  TaskRecord,
  ReservationRecord,
  LedgerRecord,
  OutboundMessageRecord,
  ChannelMessageRecord,
  ConversationReadRecord,
  PendingApprovalRecord,
  GuestRecord,
  PropertyOpsRecord,
  ReviewRecord,
  ReviewStatus,
  TaskCategory,
  TaskStatus,
  LedgerType,
}
export type {
  AutomationTrigger,
  AutomationCondition,
  AutomationAction,
  AutomationRuleRecord,
  AutomationRunStatus,
  AutomationEvent,
  AutomationRunRecord,
} from './automation'

export type { ApplyChannexBookingRevisionInput } from './commands'
export type {
  ReportSummary,
  ReportFilters,
  PropertyCapacity,
  PropertyReportRow,
  ChannelRevenueRow,
  SyncFreshnessInput,
} from './reports'
export type {
  RateCacheRow,
  RatePlanView,
  RatesReadModel,
} from './rates'
export type {
  AssignableRoom,
  AssignableStay,
} from './assign-physical-room'
export type { RecordLedgerPaymentInput } from './commands/payments'
