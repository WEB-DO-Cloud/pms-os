import { describe, expect, it } from 'vitest'
import { canPerformAction } from '@pms/auth'
import { maskSecret, toPublicSecretStatus, encryptSecret, toPublicSyncHealth } from '@pms/sync'

/** Mirrors apps/web/server/utils/integrations canManageIntegrations without Nitro imports. */
function canManageIntegrations(role: Parameters<typeof canPerformAction>[0]): boolean {
  return canPerformAction(role, 'integrations')
}

describe('integrations role gate', () => {
  it('allows org_admin and manager', () => {
    expect(canManageIntegrations('org_admin')).toBe(true)
    expect(canManageIntegrations('manager')).toBe(true)
  })

  it('denies front_desk, owners, and unauthenticated', () => {
    expect(canManageIntegrations('front_desk')).toBe(false)
    expect(canManageIntegrations('housekeeping')).toBe(false)
    expect(canManageIntegrations('property_owner')).toBe(false)
    expect(canManageIntegrations(null)).toBe(false)
    expect(canManageIntegrations(undefined)).toBe(false)
  })
})

describe('credential response redaction', () => {
  it('never includes plaintext API key or webhook secret in public status', () => {
    const apiPlain = 'chx_live_do_not_leak_this_key_9999'
    const whPlain = 'whsec-super-secret-value'
    const api = toPublicSecretStatus(encryptSecret(apiPlain))
    const webhook = toPublicSecretStatus(encryptSecret(whPlain))
    const response = {
      networkId: 1,
      apiKey: api,
      webhookSecret: webhook,
    }
    const json = JSON.stringify(response)
    expect(json).not.toContain(apiPlain)
    expect(json).not.toContain(whPlain)
    expect(response.apiKey.masked).toBe(maskSecret(apiPlain))
    expect(response.webhookSecret.masked).toBe(maskSecret(whPlain))
  })
})

describe('sync health public shape for integrations UI', () => {
  it('includes counts without error/PII detail by default', () => {
    const pub = toPublicSyncHealth(
      {
        networkId: 1,
        status: 'warning',
        lastPullAt: '2026-07-16T10:00:00.000Z',
        lastWebhookAt: null,
        lastAckAt: null,
        lastErrorCode: 'ACK_FAILED',
        lastErrorMessage: 'guest email guest@example.com',
        updatedAt: '2026-07-16T10:05:00.000Z',
      },
      { deadLetterCount: 1, pendingAckCount: 4 },
    )
    expect(pub.deadLetterCount).toBe(1)
    expect(pub.pendingAckCount).toBe(4)
    expect(pub.lastErrorCode).toBe('ACK_FAILED')
    expect(pub).not.toHaveProperty('lastErrorMessage')
    expect(JSON.stringify(pub)).not.toContain('guest@example.com')
  })
})
