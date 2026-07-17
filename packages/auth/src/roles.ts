/**
 * Fixed network membership roles and permission helpers.
 * Pure checks — pass membership/scope data in; no DB imports (avoids @pms/db cycle).
 */

export const MEMBER_ROLES = [
  'org_admin',
  'manager',
  'front_desk',
  'housekeeping',
  'accounting',
  'property_owner',
] as const

export type MemberRole = (typeof MEMBER_ROLES)[number]

export const APP_MODULES = [
  'dashboard',
  'calendar',
  'reservations',
  'inbox',
  'tasks',
  'properties',
  'rates',
  'reports',
  'automation',
  'guests',
  'reviews',
  'payments',
  'settings',
  'owner',
] as const

export type AppModule = (typeof APP_MODULES)[number]

export const PRIVILEGED_ACTIONS = [
  'integrations',
  'licensing',
  'automation_approval',
  'owner_apis',
  'settings_security',
] as const

export type PrivilegedAction = (typeof PRIVILEGED_ACTIONS)[number]

const ALL_STAFF: readonly AppModule[] = [
  'dashboard',
  'calendar',
  'reservations',
  'inbox',
  'tasks',
  'properties',
  'rates',
  'reports',
  'automation',
  'guests',
  'reviews',
  'payments',
  'settings',
]

const MODULE_MATRIX: Record<MemberRole, readonly AppModule[]> = {
  org_admin: ALL_STAFF,
  manager: ALL_STAFF,
  front_desk: [
    'dashboard',
    'calendar',
    'reservations',
    'inbox',
    'tasks',
    'properties',
    'rates',
    'guests',
    'reviews',
    'payments',
  ],
  housekeeping: ['dashboard', 'tasks', 'properties'],
  accounting: ['dashboard', 'reservations', 'guests', 'reports', 'payments'],
  property_owner: ['owner'],
}

const ACTION_MATRIX: Record<MemberRole, readonly PrivilegedAction[]> = {
  org_admin: [
    'integrations',
    'licensing',
    'automation_approval',
    'settings_security',
  ],
  manager: ['integrations', 'automation_approval', 'settings_security'],
  front_desk: [],
  housekeeping: [],
  accounting: [],
  property_owner: ['owner_apis'],
}

const TWO_FACTOR_ROLES: ReadonlySet<MemberRole> = new Set(['org_admin'])

export type PropertyScopePrincipal = {
  role: MemberRole
  /** org_admin / manager: network-wide property access */
  networkWide: boolean
  /** Staff property_memberships */
  propertyIds: readonly number[]
  /** Owner portal scope via owner_properties */
  ownerPropertyIds: readonly number[]
}

export function isMemberRole(value: unknown): value is MemberRole {
  return (
    typeof value === 'string' &&
    (MEMBER_ROLES as readonly string[]).includes(value)
  )
}

export function canAccessModule(
  role: MemberRole | null | undefined,
  module: AppModule,
): boolean {
  if (!role) return false
  return MODULE_MATRIX[role].includes(module)
}

export function canPerformAction(
  role: MemberRole | null | undefined,
  action: PrivilegedAction,
): boolean {
  if (!role) return false
  return ACTION_MATRIX[role].includes(action)
}

export function requiresTwoFactor(role: MemberRole): boolean {
  return TWO_FACTOR_ROLES.has(role)
}

export function canAccessProperty(
  principal: PropertyScopePrincipal,
  propertyId: number,
): boolean {
  if (principal.role === 'property_owner') {
    return principal.ownerPropertyIds.includes(propertyId)
  }
  if (principal.networkWide) {
    return true
  }
  return principal.propertyIds.includes(propertyId)
}

/** org_admin and manager are network-wide unless a caller overrides. */
export function isNetworkWideRole(role: MemberRole): boolean {
  return role === 'org_admin' || role === 'manager'
}
