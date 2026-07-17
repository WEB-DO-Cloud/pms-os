import { describe, expect, it } from 'vitest'
import {
  isCommercialMultiNetwork,
  isCommercialWhiteLabel,
  requireMultiNetwork,
  requireWhiteLabel,
} from './index'

describe('@pms/ee commercial gates', () => {
  it('fail closed when entitlements are missing', () => {
    expect(isCommercialMultiNetwork(null)).toBe(false)
    expect(isCommercialWhiteLabel(undefined)).toBe(false)
    expect(() => requireMultiNetwork(null)).toThrow(/multi.?network/i)
    expect(() => requireWhiteLabel({})).toThrow(/white.?label/i)
  })

  it('allows only explicit true commercial flags', () => {
    expect(
      isCommercialMultiNetwork({ multiNetwork: true, whiteLabel: false }),
    ).toBe(true)
    expect(() =>
      requireWhiteLabel({ multiNetwork: false, whiteLabel: true }),
    ).not.toThrow()
  })
})
