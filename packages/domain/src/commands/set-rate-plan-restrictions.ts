/**
 * Absolute rate-plan price and/or restriction write via the ARI outbox (U7).
 * Lane: restrictions → POST /restrictions. Money stays in minor units until the
 * Channex client boundary. U8 reuses setRatePlanNightlyRates / this command.
 */
import {
  assertCapability,
  assertFreshSnapshot,
  assertValidDateRange,
  cancelQueuedIntent,
  enqueueAriIntent,
  propertyLocalToday,
} from '../ari'
import type {
  AriWriteIntentRecord,
  CommandDefinition,
  DomainStore,
  RatePlanRecord,
} from '../store'

/** Absolute fields; omit a key to leave it unchanged in the Channex batch. */
export type RatePlanRestrictionFields = {
  /** Nightly rate in minor units (cents). */
  rateMinor?: number
  minStayArrival?: number
  minStayThrough?: number
  maxStay?: number
  closedToArrival?: boolean
  closedToDeparture?: boolean
  stopSell?: boolean
}

export type SetRatePlanRestrictionsInput = {
  propertyId: number
  ratePlanChannexId: string
  dateFrom: string
  dateTo: string
  fields: RatePlanRestrictionFields
  baseSnapshotVersion: number
  propertyTimezone?: string | null
  compensatesIntentId?: number | null
  propertyChannexId?: string | null
  /**
   * Fallback only when no catalog plan row exists. Catalog rate_mode always wins.
   */
  rateMode?: string | null
  parentRatePlanChannexId?: string | null
}

export type SetRatePlanRestrictionsResult = {
  intent: AriWriteIntentRecord
  preview: {
    ratePlanChannexId: string
    dateFrom: string
    dateTo: string
    fields: RatePlanRestrictionFields
    supersededIntentIds: number[]
  }
}

/** Channex POST /restrictions value row (rate as integer minor units). */
export type RestrictionsPayloadValue = {
  property_id: string | null
  rate_plan_id: string
  date_from: string
  date_to: string
  rate?: number
  min_stay_arrival?: number
  min_stay_through?: number
  max_stay?: number
  closed_to_arrival?: boolean
  closed_to_departure?: boolean
  stop_sell?: boolean
}

export type RestrictionsIntentPayload = {
  values: RestrictionsPayloadValue[]
  _local: {
    propertyChannexId: string | null
    fields: RatePlanRestrictionFields
  }
}

function rangesOverlap(
  aFrom: string,
  aTo: string,
  bFrom: string,
  bTo: string,
): boolean {
  return aFrom <= bTo && bFrom <= aTo
}

/**
 * Resolve rate_mode. Catalog row wins when present (ignore mismatched explicit).
 * Explicit is only a fallback when no catalog plan exists.
 */
export function resolveRateMode(
  plan: Pick<RatePlanRecord, 'parentRatePlanChannexId' | 'channexRaw'> | null,
  explicit?: string | null,
): string {
  if (plan) {
    const raw = plan.channexRaw as { rate_mode?: string } | null | undefined
    if (raw?.rate_mode?.trim()) return raw.rate_mode.trim().toLowerCase()
    // Fail closed: unknown inheritance → treat as non-manual.
    if (plan.parentRatePlanChannexId) return 'derived'
    return 'manual'
  }
  if (explicit?.trim()) return explicit.trim().toLowerCase()
  return 'manual'
}

/** Nightly price writes only on proven parent/manual plans (R10/R11). */
export function assertNightlyRateEditable(rateMode: string): void {
  if (rateMode !== 'manual') {
    throw {
      code: 'VALIDATION',
      message: `Nightly rate edits require rate_mode=manual (got ${rateMode})`,
    }
  }
}

function assertRestrictionFields(fields: RatePlanRestrictionFields): void {
  const keys = Object.keys(fields) as (keyof RatePlanRestrictionFields)[]
  if (keys.length === 0) {
    throw { code: 'VALIDATION', message: 'At least one restriction field is required' }
  }
  if (fields.rateMinor !== undefined) {
    if (!Number.isInteger(fields.rateMinor) || fields.rateMinor <= 0) {
      throw {
        code: 'VALIDATION',
        message: 'rateMinor must be a positive integer (minor units)',
      }
    }
  }
  for (const stayKey of [
    'minStayArrival',
    'minStayThrough',
    'maxStay',
  ] as const) {
    const v = fields[stayKey]
    if (v === undefined) continue
    if (!Number.isInteger(v) || v < 0) {
      throw {
        code: 'VALIDATION',
        message: `${stayKey} must be an integer ≥ 0`,
      }
    }
  }
}

function fieldsToChannexValue(
  fields: RatePlanRestrictionFields,
): Omit<RestrictionsPayloadValue, 'property_id' | 'rate_plan_id' | 'date_from' | 'date_to'> {
  const out: Omit<
    RestrictionsPayloadValue,
    'property_id' | 'rate_plan_id' | 'date_from' | 'date_to'
  > = {}
  if (fields.rateMinor !== undefined) out.rate = fields.rateMinor
  if (fields.minStayArrival !== undefined) out.min_stay_arrival = fields.minStayArrival
  if (fields.minStayThrough !== undefined) out.min_stay_through = fields.minStayThrough
  if (fields.maxStay !== undefined) out.max_stay = fields.maxStay
  if (fields.closedToArrival !== undefined) {
    out.closed_to_arrival = fields.closedToArrival
  }
  if (fields.closedToDeparture !== undefined) {
    out.closed_to_departure = fields.closedToDeparture
  }
  if (fields.stopSell !== undefined) out.stop_sell = fields.stopSell
  return out
}

export function restrictionsIdempotencyKey(
  input: Pick<
    SetRatePlanRestrictionsInput,
    | 'propertyId'
    | 'ratePlanChannexId'
    | 'dateFrom'
    | 'dateTo'
    | 'fields'
    | 'baseSnapshotVersion'
    | 'compensatesIntentId'
  >,
): string {
  const compensate = input.compensatesIntentId
    ? `:c${input.compensatesIntentId}`
    : ''
  const fieldKey = JSON.stringify(input.fields)
  return `restrictions:${input.propertyId}:${input.ratePlanChannexId}:${input.dateFrom}:${input.dateTo}:${fieldKey}:v${input.baseSnapshotVersion}${compensate}`
}

export function supersedeOverlappingQueuedRestrictions(
  store: { ariWriteIntents: AriWriteIntentRecord[] },
  networkId: number,
  propertyId: number,
  ratePlanChannexId: string,
  dateFrom: string,
  dateTo: string,
): number[] {
  const superseded: number[] = []
  for (const intent of store.ariWriteIntents) {
    if (intent.networkId !== networkId || intent.propertyId !== propertyId) continue
    if (intent.lane !== 'restrictions') continue
    if (intent.status !== 'queued' && intent.status !== 'retry') continue
    const scope = intent.resourceScope
    if (!scope?.ratePlanChannexId || scope.ratePlanChannexId !== ratePlanChannexId) {
      continue
    }
    if (!rangesOverlap(scope.dateFrom, scope.dateTo, dateFrom, dateTo)) continue
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

export const setRatePlanRestrictions: CommandDefinition<
  SetRatePlanRestrictionsInput,
  SetRatePlanRestrictionsResult
> = {
  name: 'setRatePlanRestrictions',
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
    assertCapability(store, ctx.networkId, 'rateRestrictionWrite')
    if (!input.ratePlanChannexId?.trim()) {
      throw { code: 'VALIDATION', message: 'ratePlanChannexId is required' }
    }
    assertRestrictionFields(input.fields)

    if (input.fields.rateMinor !== undefined) {
      const plan = lookupPlan(
        store,
        ctx.networkId,
        input.propertyId,
        input.ratePlanChannexId,
      )
      if (!plan && !input.rateMode?.trim()) {
        throw {
          code: 'VALIDATION',
          message:
            'Rate plan catalog entry required for nightly price edits (fail closed)',
        }
      }
      const mode = resolveRateMode(plan, input.rateMode)
      assertNightlyRateEditable(mode)
      if (
        input.parentRatePlanChannexId != null ||
        plan?.parentRatePlanChannexId != null
      ) {
        throw {
          code: 'VALIDATION',
          message: 'Inherited child rate plans cannot receive nightly price edits',
        }
      }
    }

    const today = propertyLocalToday(input.propertyTimezone)
    assertValidDateRange(input.dateFrom, input.dateTo, today)
    assertFreshSnapshot(store, ctx.networkId, input.baseSnapshotVersion)

    const supersededIntentIds = supersedeOverlappingQueuedRestrictions(
      store,
      ctx.networkId,
      input.propertyId,
      input.ratePlanChannexId,
      input.dateFrom,
      input.dateTo,
    )

    const payload: RestrictionsIntentPayload = {
      values: [
        {
          property_id: input.propertyChannexId ?? null,
          rate_plan_id: input.ratePlanChannexId,
          date_from: input.dateFrom,
          date_to: input.dateTo,
          ...fieldsToChannexValue(input.fields),
        },
      ],
      _local: {
        propertyChannexId: input.propertyChannexId ?? null,
        fields: { ...input.fields },
      },
    }

    const intent = enqueueAriIntent(store, {
      networkId: ctx.networkId,
      propertyId: input.propertyId,
      lane: 'restrictions',
      idempotencyKey: restrictionsIdempotencyKey(input),
      payload,
      resourceScope: {
        ratePlanChannexId: input.ratePlanChannexId,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
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
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          fields: { ...input.fields },
          supersededIntentIds,
        },
      },
      resourceType: 'ari_write_intent',
      resourceId: String(intent.id),
    }
  },
}

/**
 * Thin alias for nightly-only price writes (U8 AI apply reuses this name).
 * Same lane, capability, and payload as setRatePlanRestrictions with rateMinor.
 */
export type SetRatePlanNightlyRatesInput = Omit<
  SetRatePlanRestrictionsInput,
  'fields'
> & {
  rateMinor: number
}

export type SetRatePlanNightlyRatesResult = SetRatePlanRestrictionsResult

export const setRatePlanNightlyRates: CommandDefinition<
  SetRatePlanNightlyRatesInput,
  SetRatePlanNightlyRatesResult
> = {
  name: 'setRatePlanNightlyRates',
  module: 'rates',
  privilegedAction: 'ari_write',
  allowedActorKinds: ['user', 'automation'],
  risk: 'high',
  requiresApproval: true,
  supportsDryRun: true,
  needsExternalSyncRecovery: true,
  compensatingAction: 'external_sync',
  resolvePropertyId: (input) => input.propertyId,
  async execute(ctx, input, deps) {
    return setRatePlanRestrictions.execute(
      ctx,
      { ...input, fields: { rateMinor: input.rateMinor } },
      deps,
    )
  },
}
