import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  billingSnapshot,
  canConfigureMultiNetwork,
  canConfigureWhiteLabel,
  COMMUNITY_ENTITLEMENTS,
} from '@pms/licensing'
import {
  clearBrandingStore,
  saveNetworkBranding,
  whiteLabelUiState,
} from '../../server/utils/branding'
import { buildSidebarItems } from '../../app/utils/navigation'
import { buildPrincipal } from '@pms/auth'

describe('commercial gates', () => {
  it('community cannot enable white-label or multi-network', async () => {
    expect(canConfigureWhiteLabel(COMMUNITY_ENTITLEMENTS)).toBe(false)
    expect(canConfigureMultiNetwork({})).toBe(false)
    expect((await whiteLabelUiState(COMMUNITY_ENTITLEMENTS, 1)).enabled).toBe(
      false,
    )

    await expect(
      saveNetworkBranding(COMMUNITY_ENTITLEMENTS, {
        networkId: 1,
        displayName: 'Hacked Brand',
      }),
    ).rejects.toThrow(/white.?label/i)

    clearBrandingStore()
  })

  it('commercial entitlement enables multi-network and white-label UI state', async () => {
    const commercial = { multiNetwork: true, whiteLabel: true }
    expect(canConfigureMultiNetwork(commercial)).toBe(true)
    expect(canConfigureWhiteLabel(commercial)).toBe(true)

    clearBrandingStore()
    const saved = await saveNetworkBranding(commercial, {
      networkId: 7,
      displayName: 'Mar Abierto',
      logoUrl: 'https://cdn.example.com/logo.png',
      accentColor: '#112233',
    })
    expect(saved.displayName).toBe('Mar Abierto')
    expect(saved.logoUrl).toBe('https://cdn.example.com/logo.png')
    expect(
      (await whiteLabelUiState(commercial, 7)).branding?.accentColor,
    ).toBe('#112233')

    const snap = billingSnapshot(commercial)
    expect(snap.edition).toBe('commercial')
    expect(snap.commercialFeatures.every((f) => f.enabled)).toBe(true)
    clearBrandingStore()
  })

  it('community still has full staff module surface while commercial features stay gated', () => {
    const admin = buildPrincipal({
      userId: 'admin-1',
      networkId: 1,
      role: 'org_admin',
      propertyIds: [],
      networkWide: true,
      entitlements: COMMUNITY_ENTITLEMENTS,
    })!
    const labels = buildSidebarItems(admin).map((i) => i.label)
    expect(labels).toContain('Reservations')
    expect(labels).toContain('Reports')
    expect(labels).toContain('Settings')
    expect(admin.entitlements.multiNetwork).toBe(false)
    expect(admin.entitlements.whiteLabel).toBe(false)
  })

  it('docs and website packages stay isolated from @pms server packages', () => {
    const root = join(process.cwd(), '../..')
    for (const app of ['docs', 'website']) {
      const pkg = JSON.parse(
        readFileSync(join(root, 'apps', app, 'package.json'), 'utf8'),
      ) as { dependencies?: Record<string, string>; name: string }
      const deps = Object.keys(pkg.dependencies ?? {})
      expect(deps.some((d) => d.startsWith('@pms/')), `${pkg.name} deps`).toBe(
        false,
      )
    }
  })
})
