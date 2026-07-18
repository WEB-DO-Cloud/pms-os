import type {
  AppModule,
  PrivilegedAction,
  PrincipalContext,
} from '@pms/auth'
import {
  principalCanAccessModule,
  principalCanAccessProperty,
  principalCanPerformAction,
} from '@pms/auth'
import type { ActorKind, CommandContext } from './context'
import type { CompensatingAction, RiskLevel } from './risk'
import type {
  AutomationRuleRecord,
  AutomationRunRecord,
} from './automation/types'

export type TaskCategory = 'cleaning' | 'maintenance' | 'inspection' | 'other'
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'cancelled'
export type LedgerType =
  | 'charge'
  | 'payment'
  | 'refund'
  | 'adjustment'
  | 'invoice'
  | 'receipt'

export type TaskRecord = {
  id: number
  networkId: number
  propertyId: number | null
  reservationId: number | null
  title: string
  description: string | null
  category: TaskCategory
  status: TaskStatus
  /** Housekeeping list scope uses this when role === housekeeping. */
  assignedToUserId: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

/** PMS-owned property extensions (Channex catalog stays on SyncStore). */
export type PropertyOpsRecord = {
  propertyId: number
  networkId: number
  checkInTime: string | null
  checkOutTime: string | null
  notes: string | null
  status: 'active' | 'archived'
  archivedAt: string | null
  updatedAt: string
}

/** Local guest enrichments keyed for merge with reservation-derived profiles. */
export type GuestRecord = {
  id: number
  networkId: number
  guestKey: string
  email: string | null
  displayName: string
  notes: string | null
  vip: boolean
  preferences: unknown
  updatedAt: string
}

export type ReviewStatus = 'pending' | 'responded' | 'dismissed'

export type ReviewRecord = {
  id: number
  networkId: number
  propertyId: number
  reservationId: number | null
  guestName: string | null
  rating: number | null
  title: string | null
  comment: string | null
  source: string
  status: ReviewStatus
  responseTemplate: string | null
  respondedAt: string | null
  createdAt: string
}

export type ReservationRecord = {
  id: number
  networkId: number
  propertyId: number
  roomTypeId?: number | null
  /** PMS-owned physical room; null = unassigned/conflict. */
  roomId?: number | null
  status: string
  checkInDate: string
  checkOutDate: string
  currency: string
  staffNotes: string | null
  channexBookingId: string | null
  pendingSyncReason: string | null
  guestName: string | null
  guestEmail?: string | null
  adults?: number
  children?: number
  infants?: number
  channel?: string | null
  paymentCollect?: string | null
  paymentType?: string | null
  totalAmountMinor?: number | null
  /** PMS-owned front-desk state; never overwrite Channex `status`. */
  operationalStatus?: string | null
  checkedInAt?: string | null
  checkedOutAt?: string | null
  sourceRevisionId?: string | null
  channexRaw?: unknown
}

export type LedgerRecord = {
  id: number
  networkId: number
  reservationId: number
  type: LedgerType
  amountMinor: number
  currency: string
  note: string | null
  createdByPrincipal: string | null
  compensatesEntryId: number | null
  createdAt: string
}

export type BookingRevisionRecord = {
  id: number
  networkId: number
  reservationId: number | null
  channexRevisionId: string
  channexBookingId: string
  status: string
  payload: unknown
  appliedAt: string
  createdAt: string
}

export type AckOutboxRecord = {
  id: number
  networkId: number
  channexRevisionId: string
  status: 'pending' | 'sent' | 'failed'
  attempts: number
  createdAt: string
}

export type OutboundMessageRecord = {
  id: number
  networkId: number
  propertyId: number
  reservationId: number
  channel: string
  body: string
  status: 'queued' | 'sent' | 'failed'
  createdAt: string
}

/** Channel (OTA) chat message ingested from Channex — guest or property side. */
export type ChannelMessageRecord = {
  id: number
  networkId: number
  propertyId: number
  /** Null for Airbnb inquiry threads that have no booking yet. */
  reservationId: number | null
  channexThreadId: string
  channexMessageId: string
  /** OTA provider from the thread, e.g. AirBNB / BookingCom. */
  provider: string | null
  threadTitle: string | null
  sender: 'guest' | 'property' | 'system'
  body: string
  receivedAt: string
  createdAt: string
}

export type ConversationReadRecord = {
  networkId: number
  userId: string
  conversationKey: string
  lastReadAt: string
}

export type PendingApprovalRecord = {
  id: string
  networkId: number
  commandName: string
  input: unknown
  requestedByPrincipalId: string
  status: 'awaiting_approval' | 'approved' | 'rejected'
  createdAt: string
  resolvedAt?: string
  resolvedByPrincipalId?: string
}

export type IdempotencyRecord = {
  networkId: number
  key: string
  commandName: string
  resultJson: string
}

export type DomainStore = {
  tasks: TaskRecord[]
  reservations: ReservationRecord[]
  ledger: LedgerRecord[]
  bookingRevisions: BookingRevisionRecord[]
  ackOutbox: AckOutboxRecord[]
  outboundMessages: OutboundMessageRecord[]
  channelMessages: ChannelMessageRecord[]
  /** ponytail: process-local read markers; persist in PG when chat storage becomes durable. */
  conversationReads: ConversationReadRecord[]
  guests: GuestRecord[]
  reviews: ReviewRecord[]
  propertyOps: PropertyOpsRecord[]
  pendingApprovals: PendingApprovalRecord[]
  automationRules: AutomationRuleRecord[]
  automationRuns: AutomationRunRecord[]
  auditEvents: import('./audit').AuditEventRecord[]
  idempotency: IdempotencyRecord[]
  nextId: (bucket: string) => number
}

export function createMemoryStore(): DomainStore {
  const counters = new Map<string, number>()
  return {
    tasks: [],
    reservations: [],
    ledger: [],
    bookingRevisions: [],
    ackOutbox: [],
    outboundMessages: [],
    channelMessages: [],
    conversationReads: [],
    guests: [],
    reviews: [],
    propertyOps: [],
    pendingApprovals: [],
    automationRules: [],
    automationRuns: [],
    auditEvents: [],
    idempotency: [],
    nextId(bucket) {
      const n = (counters.get(bucket) ?? 0) + 1
      counters.set(bucket, n)
      return n
    },
  }
}

export type GateFns = {
  canAccessModule: typeof principalCanAccessModule
  canAccessProperty: typeof principalCanAccessProperty
  canPerformAction: typeof principalCanPerformAction
}

export const defaultGates: GateFns = {
  canAccessModule: principalCanAccessModule,
  canAccessProperty: principalCanAccessProperty,
  canPerformAction: principalCanPerformAction,
}

export type CommandDeps = {
  store: DomainStore
  gates?: GateFns
}

export type FieldOwnershipHint = {
  entity: 'reservations' | 'properties' | 'guests'
  /** Only PMS-owned fields may be mutated by staff commands. */
  mayMutate: 'pmsOwned' | 'channexOwned' | 'both'
}

export type CommandDefinition<TInput, TOutput> = {
  name: string
  module: AppModule
  privilegedAction?: PrivilegedAction
  allowedActorKinds: readonly ActorKind[]
  risk: RiskLevel
  requiresApproval: boolean
  supportsDryRun: boolean
  needsExternalSyncRecovery: boolean
  compensatingAction: CompensatingAction
  fieldOwnership?: FieldOwnershipHint
  resolvePropertyId: (input: TInput) => number | undefined
  execute: (
    ctx: CommandContext,
    input: TInput,
    deps: CommandDeps,
  ) => Promise<{ data: TOutput; resourceType: string; resourceId: string }>
}

export type AnyCommandDefinition = CommandDefinition<any, any>

export function buildSyncPrincipal(networkId: number): PrincipalContext {
  return {
    userId: 'system:sync',
    networkId,
    role: 'org_admin',
    networkWide: true,
    propertyIds: [],
    ownerPropertyIds: [],
    entitlements: { multiNetwork: false, whiteLabel: false },
  }
}

export function buildAutomationPrincipal(
  networkId: number,
  ruleId: string | number,
  propertyIds: readonly number[] = [],
): PrincipalContext {
  return {
    userId: `automation:${ruleId}`,
    networkId,
    role: 'manager',
    networkWide: propertyIds.length === 0,
    propertyIds,
    ownerPropertyIds: [],
    entitlements: { multiNetwork: false, whiteLabel: false },
  }
}
