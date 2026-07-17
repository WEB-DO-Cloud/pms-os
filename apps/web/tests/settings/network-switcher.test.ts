import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')

describe('network switcher shell', () => {
  it('community tagline is Powered by POS DO', () => {
    const composable = readFileSync(
      join(webRoot, 'app/composables/useCurrentNetwork.ts'),
      'utf8',
    )
    expect(composable).toContain("Powered by POS DO")
    expect(composable).toContain("edition.value === 'community'")
  })

  it('commercial multi-network lives inside the brand header', () => {
    const switcher = readFileSync(
      join(webRoot, 'app/components/layout/NetworkSwitcher.vue'),
      'utf8',
    )
    const sidebar = readFileSync(
      join(webRoot, 'app/components/layout/AppSidebar.vue'),
      'utf8',
    )
    const composable = readFileSync(
      join(webRoot, 'app/composables/useCurrentNetwork.ts'),
      'utf8',
    )
    const api = readFileSync(
      join(webRoot, 'server/api/networks.post.ts'),
      'utf8',
    )

    expect(switcher).toContain('brand-switcher')
    expect(switcher).toContain('brand-trigger')
    expect(switcher).toContain('ChevronsUpDown')
    expect(switcher).toContain('brandTagline')
    expect(switcher).toContain('v-for="network in networks"')
    expect(switcher).toContain('Add network…')
    expect(switcher).toContain('canCreateNetwork')
    expect(switcher).not.toContain('Property scope')
    expect(switcher).not.toContain('All permitted properties')
    expect(switcher).not.toContain('<select')

    expect(sidebar).toContain('LayoutNetworkSwitcher')
    expect(sidebar).not.toContain('brandName')
    expect(sidebar).not.toContain('brandTagline')
    expect(sidebar.match(/LayoutNetworkSwitcher/g)?.length).toBe(1)

    expect(composable).toContain('createNetwork')
    expect(composable).toContain("principal.value?.entitlements.multiNetwork === true")
    expect(composable).not.toContain('networks.value.length > 1')
    expect(api).toContain('createAdditionalNetwork')
    expect(api).toContain('assertMultiNetwork')
  })
})
