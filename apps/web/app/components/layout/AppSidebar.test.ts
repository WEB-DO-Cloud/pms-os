import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { PrincipalContext } from '@pms/auth'
import { buildSidebarItems } from '../../utils/navigation'

function principal(
  role: PrincipalContext['role'],
  options: {
    multiNetwork?: boolean
    propertyIds?: number[]
    ownerPropertyIds?: number[]
  } = {},
): PrincipalContext {
  return {
    userId: 'user-1',
    email: 'operator@pms.test',
    networkId: 1,
    role,
    networkWide: role === 'org_admin' || role === 'manager',
    propertyIds: options.propertyIds ?? [],
    ownerPropertyIds: options.ownerPropertyIds ?? [],
    twoFactorEnabled: false,
    entitlements: {
      multiNetwork: options.multiNetwork ?? false,
      whiteLabel: false,
    },
  }
}

describe('sidebar navigation', () => {
  it('keeps the full agreed module and Settings order for an org admin', () => {
    const items = buildSidebarItems(principal('org_admin'))

    expect(items.map((item) => item.label)).toEqual([
      'Dashboard',
      'Calendar',
      'Reservations',
      'Inbox',
      'Tasks',
      'Properties',
      'Rates',
      'Reports',
      'Automation',
      'Guests',
      'Reviews',
      'Payments',
      'Settings',
    ])
    expect(items.at(-1)?.children?.map((item) => item.label)).toEqual([
      'General',
      'Team & Permissions',
      'Integrations',
      'Public booking',
      'Billing & Subscription',
      'Notifications',
      'Security',
      'API & Webhooks',
    ])
  })

  it('uses the auth module matrix for operational roles', () => {
    expect(
      buildSidebarItems(principal('housekeeping')).map((item) => item.label),
    ).toEqual(['Dashboard', 'Tasks', 'Properties'])

    expect(
      buildSidebarItems(principal('accounting')).map((item) => item.label),
    ).toEqual([
      'Dashboard',
      'Reservations',
      'Reports',
      'Guests',
      'Payments',
    ])
  })

  it('limits property owners to their owner portal', () => {
    expect(
      buildSidebarItems(
        principal('property_owner', { ownerPropertyIds: [12] }),
      ).map((item) => item.label),
    ).toEqual(['Owner portal'])
  })

  it('fails closed without a principal', () => {
    expect(buildSidebarItems(null)).toEqual([])
  })

  it('uses Lucide icons instead of letter glyphs and drops Operate label', () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'AppSidebar.vue'),
      'utf8',
    )
    expect(source).toContain("from '@lucide/vue'")
    expect(source).toContain('LayoutDashboard')
    expect(source).toContain('LayoutNetworkSwitcher')
    expect(source).toContain('Sign out')
    expect(source).toContain('accountLabel')
    expect(source).not.toContain('Operate')
    expect(source).not.toMatch(/Dashboard:\s*'D'/)
  })
})
