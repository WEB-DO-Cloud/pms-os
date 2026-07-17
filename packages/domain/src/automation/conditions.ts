import type { AutomationCondition, AutomationEvent } from './types'

function matchesList(
  actual: string | null | undefined,
  expected: string | readonly string[] | undefined,
): boolean {
  if (expected == null) return true
  if (actual == null || actual === '') return false
  const list = typeof expected === 'string' ? [expected] : expected
  return list.includes(actual)
}

/**
 * Returns whether an event satisfies rule conditions (property / channel / status).
 * Empty/null conditions always match.
 */
export function evaluateConditions(
  conditions: AutomationCondition | null | undefined,
  event: AutomationEvent,
): { matched: boolean; detail: string } {
  if (!conditions) {
    return { matched: true, detail: 'no conditions' }
  }

  if (conditions.propertyIds?.length) {
    if (event.propertyId == null) {
      return { matched: false, detail: 'missing propertyId on event' }
    }
    if (!conditions.propertyIds.includes(event.propertyId)) {
      return {
        matched: false,
        detail: `property ${event.propertyId} not in [${conditions.propertyIds.join(',')}]`,
      }
    }
  }

  if (!matchesList(event.channel, conditions.channel)) {
    return {
      matched: false,
      detail: `channel ${event.channel ?? '∅'} mismatch`,
    }
  }

  if (!matchesList(event.status, conditions.status)) {
    return {
      matched: false,
      detail: `status ${event.status ?? '∅'} mismatch`,
    }
  }

  return { matched: true, detail: 'conditions matched' }
}
