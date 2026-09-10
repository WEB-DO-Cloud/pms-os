import {
  canAccessModule,
  canPerformAction,
  type AppModule,
  type PrincipalContext,
  type PrivilegedAction,
} from '@pms/auth'

export type SidebarItem = {
  label: string
  to: string
  module: AppModule
  badge?: string
  action?: PrivilegedAction
  children?: SidebarItem[]
}

const MODULE_ITEMS: readonly SidebarItem[] = [
  { label: 'Dashboard', to: '/dashboard', module: 'dashboard' },
  { label: 'Calendar', to: '/calendar', module: 'calendar' },
  { label: 'Reservations', to: '/reservations', module: 'reservations' },
  { label: 'Inbox', to: '/inbox', module: 'inbox', badge: '3' },
  { label: 'Tasks', to: '/tasks', module: 'tasks' },
  { label: 'Properties', to: '/properties', module: 'properties' },
  { label: 'Rates', to: '/rates', module: 'rates' },
  { label: 'Reports', to: '/reports', module: 'reports' },
  { label: 'Automation', to: '/automation', module: 'automation' },
  { label: 'Guests', to: '/guests', module: 'guests' },
  { label: 'Reviews', to: '/reviews', module: 'reviews' },
  { label: 'Payments', to: '/payments', module: 'payments' },
]

const SETTINGS_ITEMS: readonly SidebarItem[] = [
  { label: 'General', to: '/settings/general', module: 'settings' },
  {
    label: 'Team & Permissions',
    to: '/settings/team',
    module: 'settings',
  },
  {
    label: 'Integrations',
    to: '/settings/integrations',
    module: 'settings',
    action: 'integrations',
  },
  {
    label: 'Public booking',
    to: '/settings/booking',
    module: 'settings',
  },
  {
    label: 'Billing & Subscription',
    to: '/settings/billing',
    module: 'settings',
    action: 'licensing',
  },
  {
    label: 'Notifications',
    to: '/settings/notifications',
    module: 'settings',
  },
  {
    label: 'Security',
    to: '/settings/security',
    module: 'settings',
    action: 'settings_security',
  },
  {
    label: 'API & Webhooks',
    to: '/settings/api-webhooks',
    module: 'settings',
    action: 'integrations',
  },
]

export function buildSidebarItems(
  principal: PrincipalContext | null | undefined,
): SidebarItem[] {
  if (!principal) return []

  if (canAccessModule(principal.role, 'owner')) {
    return [{ label: 'Owner portal', to: '/owner', module: 'owner' }]
  }

  const items = MODULE_ITEMS.filter((item) =>
    canAccessModule(principal.role, item.module),
  )

  if (!canAccessModule(principal.role, 'settings')) return [...items]

  const children = SETTINGS_ITEMS.filter(
    (item) => !item.action || canPerformAction(principal.role, item.action),
  )

  return [
    ...items,
    {
      label: 'Settings',
      to: '/settings/general',
      module: 'settings',
      children,
    },
  ]
}
