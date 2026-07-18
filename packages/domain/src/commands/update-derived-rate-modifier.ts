/**
 * Derived rate-plan modifier update via the ARI outbox (U7 / AE7).
 * Lane: rate_plan → PUT /rate_plans/:id with documented derived_option only.
 * Fail closed for rate_mode other than `derived`.
 */
import {
  assertCapability,
  assertFreshSnapshot,
  cancelQueuedIntent,
  enqueueAriIntent,
} from '../ari'
import type {
  AriWriteIntentRecord,
  CommandDefinition,
  DomainStore,
  RatePlanRecord,
} from '../store'
import { resolveRateMode } from './set-rate-plan-restrictions'

/** Documented Channex derived_option rate operators (fail closed otherwise). */
export const DERIVED_RATE_OPS = [
  'increase_by_percent',
  'decrease_by_percent',
  'increase_by_amount',
  'decrease_by_amount',
] as const

export type DerivedRateOp = (typeof DERIVED_RATE_OPS)[number]

export type DerivedRateRule = [DerivedRateOp, string]

export type DerivedOptionPayload = {
  rate: DerivedRateRule[]
}

export type UpdateDerivedRateModifierInput = {
  propertyId: number
  ratePlanChannexId: string
  /** Occupancy option to patch; must exist on the plan. */
  occupancy: number
  isPrimary?: boolean
  /** Absolute desired derived_option.rate rules. */
  derivedOption: DerivedOptionPayload
  baseSnapshotVersion: number
  propertyChannexId?: string | null
  compensatesIntentId?: number | null
  /** Optional override; normally read from catalog channexRaw. */
  rateMode?: string | null
}

export type UpdateDerivedRateModifierResult = {
  intent: AriWriteIntentRecord
  preview: {
    ratePlanChannexId: string
    occupancy: number
    derivedOption: DerivedOptionPayload
    supersededIntentIds: number[]
  }
}

export type RatePlanIntentPayload = {
  rate_plan: {
    options: Array<{
      occupancy: number
      is_primary: boolean
      derived_option: DerivedOptionPayload
    }>
  }
  _local: {
    propertyChannexId: string | null
    ratePlanChannexId: string
    occupancy: number
  }
}

function assertDerivedOption(option: DerivedOptionPayload): void {
  if (!option?.rate?.length) {
    throw { code: 'VALIDATION', message: 'derivedOption.rate must be a non-empty array' }
  }
  for (const rule of option.rate) {
    if (!Array.isArray(rule) || rule.length !== 2) {
      throw {
        code: 'VALIDATION',
        message: 'Each derived rule must be [op, argument]',
      }
    }
    const [op, arg] = rule
    if (!(DERIVED_RATE_OPS as readonly string[]).includes(op)) {
      throw {
        code: 'VALIDATION',
        message: `Unsupported derived op ${String(op)}; fail closed`,
      }
    }
    if (typeof arg !== 'string' || !arg.trim()) {
      throw {
        code: 'VALIDATION',
        message: 'Derived rule argument must be a non-empty string',
      }
    }
  }
}

/** Only rate_mode=derived is proven for modifier writes (AE7). */
export function assertDerivedRateEditable(rateMode: string): void {
  if (rateMode !== 'derived') {
    throw {
      code: 'VALIDATION',
      message: `Derived modifier edits require rate_mode=derived (got ${rateMode})`,
    }
  }
}

export function derivedModifierIdempotencyKey(
  input: Pick<
    UpdateDerivedRateModifierInput,
    | 'propertyId'
    | 'ratePlanChannexId'
    | 'occupancy'
    | 'derivedOption'
    | 'baseSnapshotVersion'
    | 'compensatesIntentId'
  >,
): string {
  const compensate = input.compensatesIntentId
    ? `:c${input.compensatesIntentId}`
    : ''
  return `rate_plan:${input.propertyId}:${input.ratePlanChannexId}:occ${input.occupancy}:${JSON.stringify(input.derivedOption)}:v${input.baseSnapshotVersion}${compensate}`
}

export function supersedeQueuedDerivedModifier(
  store: { ariWriteIntents: AriWriteIntentRecord[] },
  networkId: number,
  propertyId: number,
  ratePlanChannexId: string,
): number[] {
  const superseded: number[] = []
  for (const intent of store.ariWriteIntents) {
    if (intent.networkId !== networkId || intent.propertyId !== propertyId) continue
    if (intent.lane !== 'rate_plan') continue
    if (intent.status !== 'queued' && intent.status !== 'retry') continue
    if (intent.resourceScope?.ratePlanChannexId !== ratePlanChannexId) continue
    cancelQueuedIntent(store, networkId, intent.id)
    superseded.push(intent.id)
  }
  return superseded
}

function lookupPlan(
  store: Pick<DomainStore, 'ratePlans'>,
  networkId: number,
  propertyId: number,
  ratePlanChannexId: string,
): RatePlanRecord | null {
  return (
    store.ratePlans.find(
      (p) =>
        p.networkId === networkId &&
        p.propertyId === propertyId &&
        p.channexId === ratePlanChannexId,
    ) ?? null
  )
}

export const updateDerivedRateModifier: CommandDefinition<
  UpdateDerivedRateModifierInput,
  UpdateDerivedRateModifierResult
> = {
  name: 'updateDerivedRateModifier',
  module: 'rates',
  privilegedAction: 'ari_write',
  allowedActorKinds: ['user', 'automation'],
  risk: 'high',
  requiresApproval: true,
  supportsDryRun: true,
  needsExternalSyncRecovery: true,
  compensatingAction: 'external_sync',
  resolvePropertyId: (input) => input.propertyId,
  async execute(ctx, input, { store }) {
    assertCapability(store, ctx.networkId, 'derivedRateWrite')
    if (!input.ratePlanChannexId?.trim()) {
      throw { code: 'VALIDATION', message: 'ratePlanChannexId is required' }
    }
    if (!Number.isInteger(input.occupancy) || input.occupancy < 1) {
      throw { code: 'VALIDATION', message: 'occupancy must be an integer ≥ 1' }
    }
    assertDerivedOption(input.derivedOption)

    const plan = lookupPlan(
      store,
      ctx.networkId,
      input.propertyId,
      input.ratePlanChannexId,
    )
    const mode = resolveRateMode(plan, input.rateMode)
    assertDerivedRateEditable(mode)

    // Snapshot freshness still gates even though this is a plan-level (not date) write.
    assertFreshSnapshot(store, ctx.networkId, input.baseSnapshotVersion)

    const supersededIntentIds = supersedeQueuedDerivedModifier(
      store,
      ctx.networkId,
      input.propertyId,
      input.ratePlanChannexId,
    )

    const payload: RatePlanIntentPayload = {
      rate_plan: {
        options: [
          {
            occupancy: input.occupancy,
            is_primary: input.isPrimary ?? false,
            derived_option: {
              rate: input.derivedOption.rate.map(([op, arg]) => [op, arg]),
            },
          },
        ],
      },
      _local: {
        propertyChannexId: input.propertyChannexId ?? null,
        ratePlanChannexId: input.ratePlanChannexId,
        occupancy: input.occupancy,
      },
    }

    // resourceScope date range unused for plan-level; keep today..today for schema.
    const day = new Date().toISOString().slice(0, 10)
    const intent = enqueueAriIntent(store, {
      networkId: ctx.networkId,
      propertyId: input.propertyId,
      lane: 'rate_plan',
      idempotencyKey: derivedModifierIdempotencyKey(input),
      payload,
      resourceScope: {
        ratePlanChannexId: input.ratePlanChannexId,
        dateFrom: day,
        dateTo: day,
      },
      baseSnapshotVersion: input.baseSnapshotVersion,
      actorPrincipalId: ctx.principal.userId ?? null,
      compensatesIntentId: input.compensatesIntentId ?? null,
    })

    return {
      data: {
        intent,
        preview: {
          ratePlanChannexId: input.ratePlanChannexId,
          occupancy: input.occupancy,
          derivedOption: input.derivedOption,
          supersededIntentIds,
        },
      },
      resourceType: 'ari_write_intent',
      resourceId: String(intent.id),
    }
  },
}
