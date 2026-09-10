import { collectNowNeedsCharges, type LiveCollectionPolicy } from './policy'
import { isParentOrManualRatePlan } from '../rates/stay-quote'
import type { DomainStore, RatePlanRecord } from '../store'

export type PublicBookingReadiness =
  | { status: 'ready' }
  | { status: 'not_found' }
  | {
      status: 'not_ready'
      reason:
        | 'crs_off'
        | 'no_policy'
        | 'unmapped'
        | 'collect_now_charges_disabled'
    }

export function resolvePublicBookingReadiness(input: {
  archived: boolean
  bookingCrsWrite: boolean
  policy: LiveCollectionPolicy | null
  mappedRoomTypes: number
  parentOrManualPlans: readonly RatePlanRecord[]
}): PublicBookingReadiness {
  if (input.archived) return { status: 'not_found' }
  if (!input.bookingCrsWrite) {
    return { status: 'not_ready', reason: 'crs_off' }
  }
  if (!input.policy) {
    return { status: 'not_ready', reason: 'no_policy' }
  }
  if (collectNowNeedsCharges(input.policy)) {
    return { status: 'not_ready', reason: 'collect_now_charges_disabled' }
  }
  if (input.mappedRoomTypes < 1 || input.parentOrManualPlans.length < 1) {
    return { status: 'not_ready', reason: 'unmapped' }
  }
  return { status: 'ready' }
}

export function parentOrManualPlansForProperty(
  store: Pick<DomainStore, 'ratePlans'>,
  networkId: number,
  propertyId: number,
): RatePlanRecord[] {
  return store.ratePlans.filter(
    (p) =>
      p.networkId === networkId &&
      p.propertyId === propertyId &&
      isParentOrManualRatePlan(p),
  )
}
