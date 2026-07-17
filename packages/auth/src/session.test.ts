import { describe, expect, it } from 'vitest'
import { buildPrincipal, createLoginRateLimiter } from './session'

describe('buildPrincipal', () => {
  it('returns null for missing user or invalid role', () => {
    expect(
      buildPrincipal({
        userId: '',
        networkId: 1,
        role: 'org_admin',
      }),
    ).toBeNull()
    expect(
      buildPrincipal({
        userId: 'u1',
        networkId: 1,
        role: 'superuser',
      }),
    ).toBeNull()
  })

  it('fail-closes entitlements and marks org_admin network-wide', () => {
    const p = buildPrincipal({
      userId: 'u1',
      networkId: 1,
      role: 'org_admin',
      entitlements: { multiNetwork: true },
    })
    expect(p?.networkWide).toBe(true)
    expect(p?.entitlements).toEqual({
      multiNetwork: true,
      whiteLabel: false,
    })
  })
})

describe('createLoginRateLimiter', () => {
  it('blocks after max attempts within the window', () => {
    const limiter = createLoginRateLimiter({ windowMs: 60_000, max: 2 })
    expect(limiter.check('a').allowed).toBe(true)
    expect(limiter.check('a').allowed).toBe(true)
    expect(limiter.check('a').allowed).toBe(false)
    limiter.reset('a')
    expect(limiter.check('a').allowed).toBe(true)
  })
})
