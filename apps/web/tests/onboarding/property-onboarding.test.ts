import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CHANNEX_CURRENCIES,
  isChannexCurrency,
} from '../../shared/channex-currencies'
import {
  CHANNEX_COUNTRIES,
  isChannexCountry,
} from '../../shared/channex-countries'

const webRoot = join(import.meta.dirname, '../..')

describe('commercial property onboarding', () => {
  it('dashboard shows wizard instead of connect-channex empty state in commercial', () => {
    const dash = readFileSync(join(webRoot, 'app/pages/dashboard.vue'), 'utf8')
    expect(dash).toContain('DashboardPropertyOnboardingWizard')
    expect(dash).toContain("edition === 'commercial'")
    expect(dash).toContain('showOnboarding')
    expect(dash).toContain('showOnboardingFlow')
    expect(dash).toContain('Manual property creation')
    expect(dash).toContain('showCommunityEmpty')
  })

  it('onboarding API creates property in Channex under tenant group', () => {
    const api = readFileSync(
      join(webRoot, 'server/api/onboarding/property.post.ts'),
      'utf8',
    )
    const util = readFileSync(
      join(webRoot, 'server/utils/channex-onboarding.ts'),
      'utf8',
    )
    expect(api).toContain('isCommercialEdition')
    expect(api).toContain('provisionOnboardingProperty')
    expect(util).toContain('createGroup')
    expect(util).toContain('createProperty')
    expect(util).toContain('channexGroupId')
  })

  it('currency field uses Channex-supported codes as a dropdown', () => {
    const wizard = readFileSync(
      join(webRoot, 'app/components/dashboard/PropertyOnboardingWizard.vue'),
      'utf8',
    )
    expect(wizard).toContain('CHANNEX_CURRENCIES')
    expect(wizard).toContain('<select v-model="currency"')
    expect(wizard).not.toMatch(/Currency[\s\S]*?<input[^>]*v-model="currency"/)

    expect(CHANNEX_CURRENCIES.length).toBeGreaterThan(100)
    expect(isChannexCurrency('USD')).toBe(true)
    expect(isChannexCurrency('DOP')).toBe(true)
    expect(isChannexCurrency('XYZ')).toBe(false)
  })

  it('country field uses ISO 3166-1 alpha-2 codes as a dropdown', () => {
    const wizard = readFileSync(
      join(webRoot, 'app/components/dashboard/PropertyOnboardingWizard.vue'),
      'utf8',
    )
    expect(wizard).toContain('CHANNEX_COUNTRIES')
    expect(wizard).toContain('<select v-model="country"')
    expect(wizard).not.toMatch(/<input[^>]*v-model="country"/)

    expect(CHANNEX_COUNTRIES.length).toBeGreaterThan(200)
    expect(isChannexCountry('DO')).toBe(true)
    expect(isChannexCountry('US')).toBe(true)
    expect(isChannexCountry('ZZ')).toBe(false)
  })
})
