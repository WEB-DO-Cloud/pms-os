import { describe, expect, it } from 'vitest'
import { toPublicSyncHealth } from './sync-health'
import type { SyncHealthRow } from './store'

const row: SyncHealthRow = {
  networkId: 1,
  status: 'failed',
  lastPullAt: '2026-07-16T12:00:00.000Z',
  lastWebhookAt: null,
  lastAckAt: null,
  lastErrorCode: 'UNMAPPED_PROPERTY',
  lastErrorMessage: 'Guest Jane Doe phone +18095550123 payload {...}',
  updatedAt: '2026-07-16T12:01:00.000Z',
}

describe('toPublicSyncHealth', () => {
  it('exposes status metadata without error detail or raw payloads by default', () => {
    const pub = toPublicSyncHealth(row, { deadLetterCount: 2, pendingAckCount: 3 })
    expect(pub).toEqual({
      networkId: 1,
      status: 'failed',
      lastPullAt: '2026-07-16T12:00:00.000Z',
      lastWebhookAt: null,
      lastAckAt: null,
      lastErrorCode: 'UNMAPPED_PROPERTY',
      updatedAt: '2026-07-16T12:01:00.000Z',
      deadLetterCount: 2,
      pendingAckCount: 3,
    })
    expect(pub).not.toHaveProperty('lastErrorMessage')
    expect(JSON.stringify(pub)).not.toContain('Jane Doe')
    expect(JSON.stringify(pub)).not.toContain('+18095550123')
  })

  it('includes lastErrorMessage only when explicitly requested', () => {
    const pub = toPublicSyncHealth(row, { includeErrorDetail: true })
    expect(pub.lastErrorMessage).toContain('Jane Doe')
  })
})
