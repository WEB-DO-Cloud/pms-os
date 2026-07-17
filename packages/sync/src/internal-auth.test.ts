import { describe, expect, it } from 'vitest'
import { authorizeInternalSync } from './internal-auth'

describe('internal sync auth', () => {
  it('allows shared secret header', () => {
    const prev = process.env.SYNC_INTERNAL_SECRET
    process.env.SYNC_INTERNAL_SECRET = 'sync-secret-xyz'
    expect(
      authorizeInternalSync({ secretHeader: 'sync-secret-xyz' })?.kind,
    ).toBe('secret')
    process.env.SYNC_INTERNAL_SECRET = prev
  })

  it('allows org_admin and manager session roles', () => {
    expect(authorizeInternalSync({ sessionRole: 'org_admin' })?.kind).toBe('session')
    expect(authorizeInternalSync({ sessionRole: 'manager' })?.kind).toBe('session')
    expect(authorizeInternalSync({ sessionRole: 'front_desk' })).toBeNull()
  })

  it('rejects when neither secret nor privileged role', () => {
    expect(authorizeInternalSync({})).toBeNull()
    expect(authorizeInternalSync({ secretHeader: 'bad' })).toBeNull()
  })
})
