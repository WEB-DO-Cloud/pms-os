import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildPrincipal } from '@pms/auth'
import {
  buildMobileBottomActions,
  moduleForPath,
  resolveMobileDeepLink,
} from '../../app/utils/mobile'
import {
  authorizeNotificationDeepLink,
  clearPushTokenStore,
  listPushTokensForUser,
  registerPushToken,
} from '../../server/utils/notifications'

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')

describe('mobile shell', () => {
  it('uses Nuxt names for nested shell components', () => {
    const layout = readFileSync(
      join(webRoot, 'app/layouts/default.vue'),
      'utf8',
    )
    const header = readFileSync(
      join(webRoot, 'app/components/layout/AppHeader.vue'),
      'utf8',
    )
    const mobileNav = readFileSync(
      join(webRoot, 'app/components/mobile/MobileBottomNav.vue'),
      'utf8',
    )

    expect(layout).toContain('<LayoutAppSidebar')
    expect(layout).toContain('<LayoutAppHeader')
    expect(header).toContain('Toggle navigation')
    expect(header).not.toContain('Workspace')
    expect(header).not.toContain('LayoutNetworkSwitcher')
    expect(header).not.toContain('Sign out')
    expect(header).not.toContain('profile-button')

    const sidebar = readFileSync(
      join(webRoot, 'app/components/layout/AppSidebar.vue'),
      'utf8',
    )
    expect(sidebar).toContain('LayoutNetworkSwitcher')
    expect(sidebar).toContain('Sign out')
    expect(sidebar).toContain('accountLabel')

    expect(mobileNav).toContain("from '@lucide/vue'")
    expect(mobileNav).toContain('ACTION_ICONS')
    expect(mobileNav).toContain('Menu')
    expect(mobileNav).not.toContain('item.label.slice')
  })

  it('exposes compact bottom actions from the same module matrix', () => {
    const housekeeper = buildPrincipal({
      userId: 'hk-1',
      networkId: 1,
      role: 'housekeeping',
      propertyIds: [10],
      networkWide: false,
    })!
    expect(buildMobileBottomActions(housekeeper).map((i) => i.to)).toEqual([
      '/dashboard',
      '/tasks',
    ])

    const admin = buildPrincipal({
      userId: 'admin-1',
      networkId: 1,
      role: 'org_admin',
      propertyIds: [],
      networkWide: true,
    })!
    expect(buildMobileBottomActions(admin).map((i) => i.label)).toEqual([
      'Dashboard',
      'Tasks',
      'Reservations',
      'Calendar',
    ])
  })

  it('puts inbox in the mobile header with unread badge, not bottom nav', () => {
    const header = readFileSync(
      join(webRoot, 'app/components/layout/AppHeader.vue'),
      'utf8',
    )
    const mobileNav = readFileSync(
      join(webRoot, 'app/components/mobile/MobileBottomNav.vue'),
      'utf8',
    )
    const mobileUtil = readFileSync(join(webRoot, 'app/utils/mobile.ts'), 'utf8')

    expect(header).toContain("to=\"/inbox\"")
    expect(header).toContain('inbox-badge')
    expect(header).toContain('Inbox')
    expect(mobileNav).not.toMatch(/\bInbox\b/)
    expect(mobileUtil).toContain("'/calendar'")
    expect(mobileUtil).not.toMatch(/BOTTOM_PRIORITY[\s\S]*?'\/inbox'/)
  })

  it('authorizes notification deep links and fails closed when denied', () => {
    const housekeeper = buildPrincipal({
      userId: 'hk-1',
      networkId: 1,
      role: 'housekeeping',
      propertyIds: [10],
      networkWide: false,
    })!

    expect(moduleForPath('/tasks/42')).toBe('tasks')
    expect(resolveMobileDeepLink('/tasks/42', housekeeper)).toEqual({
      ok: true,
      path: '/tasks/42',
      module: 'tasks',
    })
    expect(resolveMobileDeepLink('/reservations/9', housekeeper)).toEqual({
      ok: false,
      path: '/reservations/9',
      reason: 'forbidden',
    })
    expect(authorizeNotificationDeepLink('/reports', housekeeper).ok).toBe(
      false,
    )
    expect(resolveMobileDeepLink('/tasks', null).reason).toBe('unauthenticated')
  })

  it('binds push tokens to user + network/property scope without storing secrets files', () => {
    clearPushTokenStore()
    const saved = registerPushToken({
      userId: 'user-1',
      networkId: 7,
      propertyId: 101,
      token: 'device-token-abc',
      platform: 'android',
    })
    expect(saved.networkId).toBe(7)
    expect(listPushTokensForUser('user-1')).toHaveLength(1)

    const cap = readFileSync(join(webRoot, 'capacitor.config.ts'), 'utf8')
    expect(cap).toMatch(/webDir:\s*'www'/)
    expect(cap).not.toMatch(/AIza|AAAA|firebase|fcm_server_key/i)

    const pkg = JSON.parse(
      readFileSync(join(webRoot, 'package.json'), 'utf8'),
    ) as { scripts: Record<string, string> }
    expect(pkg.scripts['sync:mobile']).toBeTruthy()
    expect(pkg.scripts['cap:sync']).toBeTruthy()
  })
})
