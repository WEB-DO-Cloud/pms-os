/**
 * Shared ARI write helpers: capability gates, snapshot versions, and the
 * absolute desired-state intent enqueue used by every external write command.
 */
import type {
  AriWriteIntentRecord,
  AriWriteLane,
  CapabilityKey,
  DomainStore,
  NetworkCapabilityRecord,
} from './store'
import { getNetworkCapabilities } from './store'

export function assertCapability(
  store: Pick<DomainStore, 'networkCapabilities'>,
  networkId: number,
  key: CapabilityKey,
): void {
  const caps = getNetworkCapabilities(store, networkId)
  if (!caps[key]) {
    throw {
      code: 'CAPABILITY_OFF',
      message: `Write capability ${key} is disabled for this network`,
    }
  }
}

/** Highest reconciled snapshot version for a network (0 = never pulled). */
export function currentSnapshotVersion(
  store: Pick<DomainStore, 'ariAvailability' | 'ariRestrictions'>,
  networkId: number,
): number {
  let max = 0
  for (const row of store.ariAvailability) {
    if (row.networkId === networkId && row.snapshotVersion > max) max = row.snapshotVersion
  }
  for (const row of store.ariRestrictions) {
    if (row.networkId === networkId && row.snapshotVersion > max) max = row.snapshotVersion
  }
  return max
}

export function assertFreshSnapshot(
  store: Pick<DomainStore, 'ariAvailability' | 'ariRestrictions'>,
  networkId: number,
  baseSnapshotVersion: number,
): void {
  const current = currentSnapshotVersion(store, networkId)
  if (baseSnapshotVersion !== current) {
    throw {
      code: 'STALE_SNAPSHOT',
      message: `Snapshot ${baseSnapshotVersion} is stale (current ${current}); refresh and retry`,
    }
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Today as a property-local calendar date (KTD12). */
export function propertyLocalToday(timezone: string | null | undefined): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || 'UTC',
  }).format(new Date())
}

export function assertValidDateRange(
  dateFrom: string,
  dateTo: string,
  propertyToday: string,
  horizonDays = 730,
): void {
  if (!ISO_DATE.test(dateFrom) || !ISO_DATE.test(dateTo)) {
    throw { code: 'VALIDATION', message: 'Dates must be YYYY-MM-DD' }
  }
  if (dateTo < dateFrom) {
    throw { code: 'VALIDATION', message: 'dateTo must not precede dateFrom' }
  }
  if (dateFrom < propertyToday) {
    throw { code: 'VALIDATION', message: 'Past dates are not allowed' }
  }
  const horizon = new Date(`${propertyToday}T00:00:00Z`)
  horizon.setUTCDate(horizon.getUTCDate() + horizonDays)
  if (dateTo > horizon.toISOString().slice(0, 10)) {
    throw {
      code: 'VALIDATION',
      message: `Dates beyond the ${horizonDays}-day inventory horizon are not allowed`,
    }
  }
}

export type EnqueueAriIntentInput = {
  networkId: number
  propertyId: number
  lane: AriWriteLane
  idempotencyKey: string
  payload: unknown
  resourceScope: AriWriteIntentRecord['resourceScope']
  baseSnapshotVersion: number | null
  actorPrincipalId: string | null
  approvedByPrincipalId?: string | null
  compensatesIntentId?: number | null
}

/**
 * Insert a durable queued intent. Idempotent per (networkId, idempotencyKey):
 * a replayed key returns the original row without creating a sibling.
 */
export function enqueueAriIntent(
  store: Pick<DomainStore, 'ariWriteIntents' | 'nextId'>,
  input: EnqueueAriIntentInput,
): AriWriteIntentRecord {
  const existing = store.ariWriteIntents.find(
    (i) =>
      i.networkId === input.networkId && i.idempotencyKey === input.idempotencyKey,
  )
  if (existing) return existing
  const now = new Date().toISOString()
  const intent: AriWriteIntentRecord = {
    id: store.nextId('ari_write_intent'),
    networkId: input.networkId,
    propertyId: input.propertyId,
    lane: input.lane,
    idempotencyKey: input.idempotencyKey,
    payload: input.payload,
    resourceScope: input.resourceScope,
    baseSnapshotVersion: input.baseSnapshotVersion,
    status: 'queued',
    channexTaskIds: [],
    warnings: [],
    attempts: 0,
    lastError: null,
    nextAttemptAt: null,
    actorPrincipalId: input.actorPrincipalId,
    approvedByPrincipalId: input.approvedByPrincipalId ?? null,
    compensatesIntentId: input.compensatesIntentId ?? null,
    reconciledAt: null,
    createdAt: now,
    updatedAt: now,
  }
  store.ariWriteIntents.push(intent)
  return intent
}

/** Cancel a queued intent before send; anything already sent needs compensation. */
export function cancelQueuedIntent(
  store: Pick<DomainStore, 'ariWriteIntents'>,
  networkId: number,
  intentId: number,
): AriWriteIntentRecord {
  const intent = store.ariWriteIntents.find(
    (i) => i.networkId === networkId && i.id === intentId,
  )
  if (!intent) {
    throw { code: 'NOT_FOUND', message: 'Intent not found' }
  }
  if (intent.status !== 'queued' && intent.status !== 'retry') {
    throw {
      code: 'CONFLICT',
      message: `Intent is ${intent.status}; only queued/retry intents can be cancelled`,
    }
  }
  intent.status = 'cancelled'
  intent.updatedAt = new Date().toISOString()
  return intent
}
