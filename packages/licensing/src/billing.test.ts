import { describe, expect, it } from 'vitest'
import {
  COMMERCIAL_ONLY_FEATURES,
  billingSnapshot,
  canConfigureMultiNetwork,
  canConfigureWhiteLabel,
  licenseEdition,
} from './billing'
import { COMMUNITY_ENTITLEMENTS } from './entitlements'

describe('billing / commercial boundary', () => {
  it('lists only multi-network and white-label as commercial-only', () => {
    expect(COMMERCIAL_ONLY_FEATURES.map((f) => f.id)).toEqual([
      'multi_network',
      'white_label',
    ])
  })

  it('community cannot enable white-label or multi-network', () => {
    expect(licenseEdition(COMMUNITY_ENTITLEMENTS)).toBe('community')
    expect(canConfigureWhiteLabel(COMMUNITY_ENTITLEMENTS)).toBe(false)
    expect(canConfigureMultiNetwork(null)).toBe(false)
    const snap = billingSnapshot({})
    expect(snap.edition).toBe('community')
    expect(snap.commercialFeatures.every((f) => f.enabled === false)).toBe(true)
  })

  it('commercial entitlement opens the matching gates only', () => {
    expect(
      canConfigureMultiNetwork({ multiNetwork: true, whiteLabel: false }),
    ).toBe(true)
    expect(
      canConfigureWhiteLabel({ multiNetwork: true, whiteLabel: false }),
    ).toBe(false)
    const snap = billingSnapshot({ multiNetwork: true, whiteLabel: true })
    expect(snap.edition).toBe('commercial')
    expect(snap.commercialFeatures.find((f) => f.id === 'white_label')?.enabled).toBe(
      true,
    )
  })
})
