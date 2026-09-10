import type { DomainStore } from '@pms/domain'
import { releaseHold } from '../utils/property-stripe'

export function expirePendingPublicHolds(store: DomainStore, nowMs = Date.now()) {
  let released = 0
  for (const row of store.reservations) {
    if (row.status !== 'pending_payment') continue
    if (!row.checkoutExpiresAt) continue
    if (Date.parse(row.checkoutExpiresAt) > nowMs) continue
    // Stripe-bound holds are released only after retrieve/webhook, never by local TTL.
    if (row.stripeCheckoutSessionId) continue
    releaseHold(row, 'expired', store)
    released++
  }
  return released
}
