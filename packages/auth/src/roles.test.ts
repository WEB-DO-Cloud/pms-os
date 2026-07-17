import { describe, expect, it } from 'vitest'
import {
  canAccessModule,
  canAccessProperty,
  canPerformAction,
  requiresTwoFactor,
  type MemberRole,
  type PropertyScopePrincipal,
} from './roles'

const STAFF_MODULES = [
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
] as const

describe('role module matrix', () => {
  it('org_admin and manager can access the full staff module surface', () => {
    for (const role of ['org_admin', 'manager'] as const) {
      for (const mod of STAFF_MODULES) {
        expect(canAccessModule(role, mod)).toBe(true)
      }
      expect(canAccessModule(role, 'owner')).toBe(false)
    }
  })

  it('housekeeping cannot access reservations, reports, or settings', () => {
    expect(canAccessModule('housekeeping', 'tasks')).toBe(true)
    expect(canAccessModule('housekeeping', 'dashboard')).toBe(true)
    expect(canAccessModule('housekeeping', 'reservations')).toBe(false)
    expect(canAccessModule('housekeeping', 'reports')).toBe(false)
    expect(canAccessModule('housekeeping', 'settings')).toBe(false)
  })

  it('property_owner is owner-portal scoped only', () => {
    expect(canAccessModule('property_owner', 'owner')).toBe(true)
    for (const mod of STAFF_MODULES) {
      expect(canAccessModule('property_owner', mod)).toBe(false)
    }
  })

  it('front_desk and accounting get distinct operational modules', () => {
    expect(canAccessModule('front_desk', 'reservations')).toBe(true)
    expect(canAccessModule('front_desk', 'calendar')).toBe(true)
    expect(canAccessModule('front_desk', 'reports')).toBe(false)
    expect(canAccessModule('front_desk', 'settings')).toBe(false)
    expect(canAccessModule('front_desk', 'automation')).toBe(false)

    expect(canAccessModule('accounting', 'payments')).toBe(true)
    expect(canAccessModule('accounting', 'reports')).toBe(true)
    expect(canAccessModule('accounting', 'reservations')).toBe(true)
    expect(canAccessModule('accounting', 'settings')).toBe(false)
    expect(canAccessModule('accounting', 'tasks')).toBe(false)
  })

  it('null/undefined role is denied everywhere', () => {
    expect(canAccessModule(null, 'dashboard')).toBe(false)
    expect(canAccessModule(undefined, 'tasks')).toBe(false)
  })
})

describe('privileged action guards', () => {
  const privileged = [
    'integrations',
    'licensing',
    'automation_approval',
    'owner_apis',
    'settings_security',
  ] as const

  it('unauthenticated callers are denied privileged actions', () => {
    for (const action of privileged) {
      expect(canPerformAction(null, action)).toBe(false)
      expect(canPerformAction(undefined, action)).toBe(false)
    }
  })

  it('wrong roles are denied integrations, licensing, automation approval, owner APIs, settings security', () => {
    expect(canPerformAction('front_desk', 'integrations')).toBe(false)
    expect(canPerformAction('housekeeping', 'licensing')).toBe(false)
    expect(canPerformAction('accounting', 'automation_approval')).toBe(false)
    expect(canPerformAction('manager', 'owner_apis')).toBe(false)
    expect(canPerformAction('front_desk', 'settings_security')).toBe(false)
    expect(canPerformAction('property_owner', 'integrations')).toBe(false)
    expect(canPerformAction('property_owner', 'settings_security')).toBe(false)
  })

  it('org_admin can perform admin privileged actions; owners can call owner APIs', () => {
    expect(canPerformAction('org_admin', 'integrations')).toBe(true)
    expect(canPerformAction('org_admin', 'licensing')).toBe(true)
    expect(canPerformAction('org_admin', 'automation_approval')).toBe(true)
    expect(canPerformAction('org_admin', 'settings_security')).toBe(true)
    expect(canPerformAction('org_admin', 'owner_apis')).toBe(false)

    expect(canPerformAction('manager', 'integrations')).toBe(true)
    expect(canPerformAction('manager', 'automation_approval')).toBe(true)
    expect(canPerformAction('manager', 'settings_security')).toBe(true)
    expect(canPerformAction('manager', 'licensing')).toBe(false)

    expect(canPerformAction('property_owner', 'owner_apis')).toBe(true)
  })

  it('org_admin requires 2FA; non-privileged roles do not', () => {
    expect(requiresTwoFactor('org_admin')).toBe(true)
    expect(requiresTwoFactor('manager')).toBe(false)
    expect(requiresTwoFactor('front_desk')).toBe(false)
  })
})

describe('property scoping', () => {
  function principal(
    role: MemberRole,
    opts: Partial<PropertyScopePrincipal> = {},
  ): PropertyScopePrincipal {
    return {
      role,
      networkWide: false,
      propertyIds: [],
      ownerPropertyIds: [],
      ...opts,
    }
  }

  it('network-wide staff can access any property in the network', () => {
    const admin = principal('org_admin', { networkWide: true })
    expect(canAccessProperty(admin, 1)).toBe(true)
    expect(canAccessProperty(admin, 99)).toBe(true)
  })

  it('property-scoped staff cannot read/mutate unassigned properties', () => {
    const desk = principal('front_desk', { propertyIds: [10, 11] })
    expect(canAccessProperty(desk, 10)).toBe(true)
    expect(canAccessProperty(desk, 12)).toBe(false)

    const hk = principal('housekeeping', { propertyIds: [5] })
    expect(canAccessProperty(hk, 5)).toBe(true)
    expect(canAccessProperty(hk, 6)).toBe(false)
  })

  it('owners scoped via owner_properties cannot see sibling properties', () => {
    const owner = principal('property_owner', { ownerPropertyIds: [1, 2] })
    expect(canAccessProperty(owner, 1)).toBe(true)
    expect(canAccessProperty(owner, 2)).toBe(true)
    expect(canAccessProperty(owner, 3)).toBe(false)
  })

  it('staff propertyIds do not grant owner sibling access and vice versa', () => {
    const owner = principal('property_owner', {
      propertyIds: [99],
      ownerPropertyIds: [1],
    })
    expect(canAccessProperty(owner, 99)).toBe(false)
    expect(canAccessProperty(owner, 1)).toBe(true)
  })
})
