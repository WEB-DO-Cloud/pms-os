import { describe, expect, it } from 'vitest'
import {
  decryptSecret,
  encryptSecret,
  maskSecret,
  resolveSecret,
  toPublicSecretStatus,
} from './secrets'

describe('secret encryption + redaction', () => {
  it('round-trips AES-GCM ciphertext without exposing plaintext in material', () => {
    const plain = 'chx_live_super_secret_key_abc123'
    const material = encryptSecret(plain)
    expect(material.ciphertext).not.toContain(plain)
    expect(material.iv).not.toBe('stub')
    expect(decryptSecret(material.ciphertext, material.iv, material.keyVersion)).toBe(plain)
  })

  it('masks secrets for API responses — never echoes full value', () => {
    const plain = 'chx_live_super_secret_key_abc123'
    const masked = maskSecret(plain)
    expect(masked).toBe('••••••••c123')
    expect(masked).not.toContain('chx_live')
    expect(masked).not.toBe(plain)
  })

  it('public status redacts configured secrets', () => {
    const material = encryptSecret('whsec-test-webhook-secret')
    const pub = toPublicSecretStatus(material)
    expect(pub.configured).toBe(true)
    expect(pub.masked).toMatch(/^••••/)
    expect(pub.masked).not.toContain('whsec-test')
    expect(JSON.stringify(pub)).not.toContain('whsec-test-webhook-secret')
  })

  it('legacy stub ciphertext still resolves for U5 fixtures', () => {
    expect(resolveSecret({ ciphertext: 'plain-key', iv: 'stub', keyVersion: 'v0' })).toBe(
      'plain-key',
    )
  })
})
