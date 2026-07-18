import type { AriWriteIntentRecord, AriWriteLane, DomainStore } from '@pms/domain'
import type { SyncHealthRow, SyncStore } from './store'

/** Alert when an accepted intent stays unreconciled longer than this (R17). */
export const ACCEPTED_ALERT_AGE_MS = 30 * 60 * 1000

/** Intents still in the write/reconcile pipeline (not terminal). */
const OPEN_STATUSES = new Set([
  'queued',
  'sending',
  'accepted',
  'partial',
  'retry',
  'reconciling',
])

const ACCEPTED_UNRECONCILED = new Set(['accepted', 'reconciling'])

export type AriWriteStuckAlert = {
  networkId: number
  propertyId: number
  intentId: number
  lane: AriWriteLane
  ageMs: number
  roomTypeChannexId?: string
  ratePlanChannexId?: string
  dateFrom?: string
  dateTo?: string
}

export type AriWritePropertyHealth = {
  propertyId: number
  pendingOutboxCount: number
  acceptedUnreconciledCount: number
  partialCount: number
  driftedCount: number
  retryCount: number
  pendingByLane: Partial<Record<AriWriteLane, number>>
  stuckAccepted: AriWriteStuckAlert[]
}

export type AriWriteHealthMetrics = {
  pendingOutboxCount: number
  pendingOutboxByLane: Partial<Record<AriWriteLane, number>>
  acceptedUnreconciledCount: number
  partialCount: number
  driftedCount: number
  retryCount: number
  /** Intents that carried Channex warnings (partial outcomes). */
  warningIntentCount: number
  oldestAcceptedAt: string | null
  oldestQueuedAt: string | null
  /** Oldest booking_crs intent still open (no guest fields). */
  oldestPendingBookingRevisionAt: string | null
  acceptedAlertThresholdMs: number
  stuckAcceptedAlerts: AriWriteStuckAlert[]
  properties: AriWritePropertyHealth[]
}

export type SyncHealthPublic = Omit<SyncHealthRow, 'lastErrorMessage'> & {
  lastErrorMessage?: string | null
  deadLetterCount?: number
  pendingAckCount?: number
  ariWrite?: AriWriteHealthMetrics
}

function bumpLane(
  map: Partial<Record<AriWriteLane, number>>,
  lane: AriWriteLane,
): void {
  map[lane] = (map[lane] ?? 0) + 1
}

function scopeHint(intent: AriWriteIntentRecord): Pick<
  AriWriteStuckAlert,
  'roomTypeChannexId' | 'ratePlanChannexId' | 'dateFrom' | 'dateTo'
> {
  return {
    ...(intent.resourceScope?.roomTypeChannexId
      ? { roomTypeChannexId: intent.resourceScope.roomTypeChannexId }
      : {}),
    ...(intent.resourceScope?.ratePlanChannexId
      ? { ratePlanChannexId: intent.resourceScope.ratePlanChannexId }
      : {}),
    ...(intent.resourceScope?.dateFrom
      ? { dateFrom: intent.resourceScope.dateFrom }
      : {}),
    ...(intent.resourceScope?.dateTo ? { dateTo: intent.resourceScope.dateTo } : {}),
  }
}

/**
 * Aggregate ARI / Booking CRS write-intent health for a network.
 * Counts and scope hints only — never payloads, guest names, or secrets.
 */
export function aggregateAriWriteHealth(
  domain: Pick<DomainStore, 'ariWriteIntents'>,
  networkId: number,
  opts?: { nowMs?: number; acceptedAlertAgeMs?: number },
): AriWriteHealthMetrics {
  const nowMs = opts?.nowMs ?? Date.now()
  const threshold = opts?.acceptedAlertAgeMs ?? ACCEPTED_ALERT_AGE_MS
  const intents = domain.ariWriteIntents.filter((i) => i.networkId === networkId)

  const pendingOutboxByLane: Partial<Record<AriWriteLane, number>> = {}
  const byProperty = new Map<number, AriWritePropertyHealth>()
  const stuckAcceptedAlerts: AriWriteStuckAlert[] = []

  let pendingOutboxCount = 0
  let acceptedUnreconciledCount = 0
  let partialCount = 0
  let driftedCount = 0
  let retryCount = 0
  let warningIntentCount = 0
  let oldestAcceptedAt: string | null = null
  let oldestQueuedAt: string | null = null
  let oldestPendingBookingRevisionAt: string | null = null

  function prop(propertyId: number): AriWritePropertyHealth {
    let row = byProperty.get(propertyId)
    if (!row) {
      row = {
        propertyId,
        pendingOutboxCount: 0,
        acceptedUnreconciledCount: 0,
        partialCount: 0,
        driftedCount: 0,
        retryCount: 0,
        pendingByLane: {},
        stuckAccepted: [],
      }
      byProperty.set(propertyId, row)
    }
    return row
  }

  for (const intent of intents) {
    const p = prop(intent.propertyId)
    if (Array.isArray(intent.warnings) && intent.warnings.length > 0) {
      warningIntentCount++
    }

    if (OPEN_STATUSES.has(intent.status)) {
      pendingOutboxCount++
      p.pendingOutboxCount++
      bumpLane(pendingOutboxByLane, intent.lane)
      bumpLane(p.pendingByLane, intent.lane)
      if (
        !oldestQueuedAt ||
        intent.createdAt < oldestQueuedAt
      ) {
        oldestQueuedAt = intent.createdAt
      }
    }

    if (ACCEPTED_UNRECONCILED.has(intent.status)) {
      acceptedUnreconciledCount++
      p.acceptedUnreconciledCount++
      if (!oldestAcceptedAt || intent.updatedAt < oldestAcceptedAt) {
        oldestAcceptedAt = intent.updatedAt
      }
      const ageMs = Math.max(0, nowMs - new Date(intent.updatedAt).getTime())
      if (ageMs >= threshold) {
        const alert: AriWriteStuckAlert = {
          networkId,
          propertyId: intent.propertyId,
          intentId: intent.id,
          lane: intent.lane,
          ageMs,
          ...scopeHint(intent),
        }
        stuckAcceptedAlerts.push(alert)
        p.stuckAccepted.push(alert)
      }
    }

    if (intent.status === 'partial') {
      partialCount++
      p.partialCount++
    }
    if (intent.status === 'drifted') {
      driftedCount++
      p.driftedCount++
    }
    if (intent.status === 'retry') {
      retryCount++
      p.retryCount++
    }

    if (
      intent.lane === 'booking_crs' &&
      OPEN_STATUSES.has(intent.status) &&
      (!oldestPendingBookingRevisionAt ||
        intent.createdAt < oldestPendingBookingRevisionAt)
    ) {
      oldestPendingBookingRevisionAt = intent.createdAt
    }
  }

  return {
    pendingOutboxCount,
    pendingOutboxByLane,
    acceptedUnreconciledCount,
    partialCount,
    driftedCount,
    retryCount,
    warningIntentCount,
    oldestAcceptedAt,
    oldestQueuedAt,
    oldestPendingBookingRevisionAt,
    acceptedAlertThresholdMs: threshold,
    stuckAcceptedAlerts,
    properties: [...byProperty.values()].sort((a, b) => a.propertyId - b.propertyId),
  }
}

/** Safe sync-health view for integrations UI. Raw payloads / PII excluded. */
export function toPublicSyncHealth(
  row: SyncHealthRow,
  opts?: {
    includeErrorDetail?: boolean
    deadLetterCount?: number
    pendingAckCount?: number
    ariWrite?: AriWriteHealthMetrics
  },
): SyncHealthPublic {
  const pub: SyncHealthPublic = {
    networkId: row.networkId,
    status: row.status,
    lastPullAt: row.lastPullAt,
    lastWebhookAt: row.lastWebhookAt,
    lastAckAt: row.lastAckAt,
    lastErrorCode: row.lastErrorCode,
    updatedAt: row.updatedAt,
    deadLetterCount: opts?.deadLetterCount,
    pendingAckCount: opts?.pendingAckCount,
  }
  if (opts?.ariWrite) {
    pub.ariWrite = opts.ariWrite
  }
  if (opts?.includeErrorDetail) {
    pub.lastErrorMessage = row.lastErrorMessage
  }
  return pub
}

export function markSyncRunning(store: { updateSyncHealth: SyncStore['updateSyncHealth'] }, networkId: number) {
  return store.updateSyncHealth(networkId, { status: 'running' })
}

export function markSyncHealthy(
  store: { updateSyncHealth: SyncStore['updateSyncHealth'] },
  networkId: number,
  patch: Partial<Pick<SyncHealthRow, 'lastPullAt' | 'lastWebhookAt' | 'lastAckAt'>>,
) {
  return store.updateSyncHealth(networkId, {
    status: 'healthy',
    lastErrorCode: null,
    lastErrorMessage: null,
    ...patch,
  })
}

export function markSyncFailed(
  store: { updateSyncHealth: SyncStore['updateSyncHealth'] },
  networkId: number,
  code: string,
  message: string,
) {
  return store.updateSyncHealth(networkId, {
    status: 'failed',
    lastErrorCode: code,
    lastErrorMessage: message,
  })
}
