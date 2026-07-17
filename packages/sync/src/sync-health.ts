import type { SyncHealthRow, SyncStore } from './store'

export type SyncHealthPublic = Omit<SyncHealthRow, 'lastErrorMessage'> & {
  lastErrorMessage?: string | null
  deadLetterCount?: number
  pendingAckCount?: number
}

/** Safe sync-health view for integrations UI (U7). Raw payloads excluded. */
export function toPublicSyncHealth(
  row: SyncHealthRow,
  opts?: {
    includeErrorDetail?: boolean
    deadLetterCount?: number
    pendingAckCount?: number
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
