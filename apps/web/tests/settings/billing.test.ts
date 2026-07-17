import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  countBillableFromRows,
  estimateMonthlyUsd,
  isHotelPropertyType,
  propertyTypeFromRaw,
  RATE_HOTEL_USD,
  RATE_PROPERTY_USD,
} from '../../server/utils/billing'

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')

describe('settings billing', () => {
  it('splits hotels vs properties from Channex property_type', () => {
    expect(propertyTypeFromRaw({ attributes: { property_type: 'hotel' } })).toBe(
      'hotel',
    )
    expect(isHotelPropertyType('hotel')).toBe(true)
    expect(isHotelPropertyType('apartment')).toBe(false)

    const counts = countBillableFromRows([
      { channexRaw: { attributes: { property_type: 'hotel' } } },
      { channexRaw: { attributes: { property_type: 'hotel' } } },
      { channexRaw: { attributes: { property_type: 'apartment' } } },
      { channexRaw: { attributes: { property_type: 'villa' } } },
      { channexRaw: null },
    ])
    expect(counts).toEqual({ hotels: 2, properties: 3 })
    expect(estimateMonthlyUsd(counts)).toBe(
      Math.round((2 * RATE_HOTEL_USD + 3 * RATE_PROPERTY_USD) * 100) / 100,
    )
    expect(estimateMonthlyUsd({ hotels: 1, properties: 1 })).toBe(26.9)
  })

  it('rewrites billing page around Stripe subscription', () => {
    const page = readFileSync(
      join(webRoot, 'app/pages/settings/billing.vue'),
      'utf8',
    )
    expect(page).toContain('Billing & Subscription')
    expect(page).toContain('/api/settings/billing')
    expect(page).toContain('/api/settings/billing/checkout')
    expect(page).toContain('/api/settings/billing/portal')
    expect(page).toContain('Subscribe')
    expect(page).toContain('Manage billing')
    expect(page).not.toContain('SettingsLicenseStatus')
    expect(page).not.toContain('SettingsWhiteLabelForm')
  })

  it('exposes billing overview, checkout, portal, and Stripe webhook routes', () => {
    const get = readFileSync(
      join(webRoot, 'server/api/settings/billing.get.ts'),
      'utf8',
    )
    const checkout = readFileSync(
      join(webRoot, 'server/api/settings/billing/checkout.post.ts'),
      'utf8',
    )
    const portal = readFileSync(
      join(webRoot, 'server/api/settings/billing/portal.post.ts'),
      'utf8',
    )
    const webhook = readFileSync(
      join(webRoot, 'server/api/webhooks/stripe.post.ts'),
      'utf8',
    )
    expect(get).toContain('getBillingOverview')
    expect(checkout).toContain('createCheckoutSession')
    expect(portal).toContain('createPortalSession')
    expect(webhook).toContain('constructStripeEvent')
    expect(webhook).toContain('handleStripeWebhookEvent')
  })
})
