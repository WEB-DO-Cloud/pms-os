import {
  canAccessModule,
  type AppModule,
  type PrincipalContext,
} from '@pms/auth'
import { buildSidebarItems, type SidebarItem } from './navigation'

/** Route prefix → module for push / deep-link authorization. */
const PATH_MODULES: readonly { prefix: string; module: AppModule }[] = [
  { prefix: '/owner', module: 'owner' },
  { prefix: '/dashboard', module: 'dashboard' },
  { prefix: '/calendar', module: 'calendar' },
  { prefix: '/reservations', module: 'reservations' },
  { prefix: '/inbox', module: 'inbox' },
  { prefix: '/tasks', module: 'tasks' },
  { prefix: '/properties', module: 'properties' },
  { prefix: '/rates', module: 'rates' },
  { prefix: '/reports', module: 'reports' },
  { prefix: '/automation', module: 'automation' },
  { prefix: '/guests', module: 'guests' },
  { prefix: '/reviews', module: 'reviews' },
  { prefix: '/payments', module: 'payments' },
  { prefix: '/settings', module: 'settings' },
]

const BOTTOM_PRIORITY = [
  '/dashboard',
  '/tasks',
  '/reservations',
  '/calendar',
] as const

export type DeepLinkResult =
  | { ok: true; path: string; module: AppModule }
  | { ok: false; path: string; reason: string }

export function moduleForPath(path: string): AppModule | null {
  const normalized = path.split('?')[0] || '/'
  if (normalized === '/' || normalized === '') return 'dashboard'
  for (const entry of PATH_MODULES) {
    if (
      normalized === entry.prefix ||
      normalized.startsWith(`${entry.prefix}/`)
    ) {
      return entry.module
    }
  }
  return null
}

/** Authorize a notification deep link against the session principal. */
export function resolveMobileDeepLink(
  path: string,
  principal: PrincipalContext | null | undefined,
): DeepLinkResult {
  if (!principal) {
    return { ok: false, path, reason: 'unauthenticated' }
  }
  const module = moduleForPath(path)
  if (!module) {
    return { ok: false, path, reason: 'unknown_route' }
  }
  if (!canAccessModule(principal.role, module)) {
    return { ok: false, path, reason: 'forbidden' }
  }
  return { ok: true, path, module }
}

/** Compact bottom-nav actions: prioritized modules the principal can already access. */
export function buildMobileBottomActions(
  principal: PrincipalContext | null | undefined,
  limit = 4,
): SidebarItem[] {
  const byPath = new Map(
    buildSidebarItems(principal)
      .filter((item) => !item.children)
      .map((item) => [item.to, item]),
  )
  const picked: SidebarItem[] = []
  for (const path of BOTTOM_PRIORITY) {
    const item = byPath.get(path)
    if (item) picked.push(item)
    if (picked.length >= limit) break
  }
  return picked
}
