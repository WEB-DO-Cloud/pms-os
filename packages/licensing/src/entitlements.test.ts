import { describe, expect, it } from 'vitest'
import {
  assertMultiNetwork,
  assertWhiteLabel,
  canUseMultiNetwork,
  canUseWhiteLabel,
  COMMUNITY_ENTITLEMENTS,
  resolveEntitlements,
} from './entitlements'

describe('commercial entitlements fail closed', () => {
  it('community defaults block multi-network and white-label', () => {
    expect(COMMUNITY_ENTITLEMENTS.multiNetwork).toBe(false)
    expect(COMMUNITY_ENTITLEMENTS.whiteLabel).toBe(false)
    expect(canUseMultiNetwork(COMMUNITY_ENTITLEMENTS)).toBe(false)
    expect(canUseWhiteLabel(COMMUNITY_ENTITLEMENTS)).toBe(false)
  })

  it('missing or partial entitlement rows resolve to community (fail closed)', () => {
    expect(resolveEntitlements(null)).toEqual(COMMUNITY_ENTITLEMENTS)
    expect(resolveEntitlements(undefined)).toEqual(COMMUNITY_ENTITLEMENTS)
    expect(resolveEntitlements({})).toEqual(COMMUNITY_ENTITLEMENTS)
    expect(resolveEntitlements({ multiNetwork: true })).toEqual({
      multiNetwork: true,
      whiteLabel: false,
    })
  })

  it('commercial flags only enable when explicitly true', () => {
    expect(canUseMultiNetwork({ multiNetwork: true, whiteLabel: false })).toBe(true)
    expect(canUseWhiteLabel({ multiNetwork: false, whiteLabel: true })).toBe(true)
    expect(canUseMultiNetwork({ multiNetwork: false, whiteLabel: true })).toBe(false)
    expect(canUseWhiteLabel({ multiNetwork: true, whiteLabel: false })).toBe(false)
  })

  it('assert helpers throw so API-style checks cannot bypass gates', () => {
    expect(() => assertMultiNetwork(COMMUNITY_ENTITLEMENTS)).toThrow(/multi.?network/i)
    expect(() => assertWhiteLabel(COMMUNITY_ENTITLEMENTS)).toThrow(/white.?label/i)
    expect(() =>
      assertMultiNetwork({ multiNetwork: true, whiteLabel: false }),
    ).not.toThrow()
    expect(() =>
      assertWhiteLabel({ multiNetwork: false, whiteLabel: true }),
    ).not.toThrow()
  })

  it('truthy-looking non-boolean values do not open commercial gates', () => {
    // @ts-expect-error intentional bypass attempt
    expect(canUseMultiNetwork({ multiNetwork: 'yes', whiteLabel: 1 })).toBe(false)
    // @ts-expect-error intentional bypass attempt
    expect(canUseWhiteLabel({ multiNetwork: 1, whiteLabel: 'true' })).toBe(false)
  })
})
