import { principalCanAccessProperty, type PrincipalContext } from '@pms/auth'
import {
  assertFreshSnapshot,
  assertValidDateRange,
  currentSnapshotVersion,
  getNetworkCapabilities,
  propertyLocalToday,
  resolveRateMode,
  runCommand,
  type RatePlanRestrictionFields,
  type SetRatePlanRestrictionsInput,
  type SetRatePlanRestrictionsResult,
  type UpdateDerivedRateModifierInput,
  type UpdateDerivedRateModifierResult,
} from '@pms/domain'
import { createError } from 'h3'
import { commandCtx, getDomainStore } from './reservations'
import { ensureSecretsHydrated, getSyncStore } from './sync'

function throwCommandError(result: {
  error?: { code?: string; message?: string } | null
}) {
  const code = result.error?.code
  throw createError({
    statusCode:
      code === 'PROPERTY_SCOPE' ||
      code === 'MODULE_DENIED' ||
      code === 'ACTION_DENIED' ||
      code === 'CAPABILITY_OFF' ||
      code === 'NETWORK_SCOPE'
        ? 403
        : code === 'STALE_SNAPSHOT'
          ? 409
          : 400,
    statusMessage: result.error?.message ?? 'ARI write failed',
    data: result,
  })
}

export type CalendarRestrictionsInput = {
  propertyId: number
  ratePlanChannexId: string
  dateFrom: string
  dateTo: string
  fields: RatePlanRestrictionFields
  baseSnapshotVersion: number
  compensatesIntentId?: number | null
  previewOnly?: boolean
}

export type CalendarDerivedModifierInput = {
  propertyId: number
  ratePlanChannexId: string
  occupancy: number
  isPrimary?: boolean
  derivedOption: { rate: [string, string][] }
  baseSnapshotVersion: number
  compensatesIntentId?: number | null
  previewOnly?: boolean
}

async function resolveProperty(networkId: number, propertyId: number) {
  const sync = getSyncStore(networkId)
  const property = sync.listProperties(networkId).find((p) => p.id === propertyId)
  if (!property) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Property not found',
      data: { code: 'VALIDATION' },
    })
  }
  return property
}

/**
 * Preview or enqueue absolute rate-plan price/restriction writes (U7).
 */
export async function setCalendarRestrictions(
  principal: PrincipalContext,
  input: CalendarRestrictionsInput,
) {
  if (principal.networkId == null) {
    throw createError({ statusCode: 403, statusMessage: 'Network required' })
  }
  if (!principalCanAccessProperty(principal, input.propertyId)) {
    throw createError({ statusCode: 403, statusMessage: 'Property out of scope' })
  }

  const networkId = principal.networkId
  await ensureSecretsHydrated(networkId)
  const store = getDomainStore(networkId)

  if (!getNetworkCapabilities(store, networkId).rateRestrictionWrite) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Rate/restriction write is disabled for this network',
      data: { code: 'CAPABILITY_OFF' },
    })
  }

  const property = await resolveProperty(networkId, input.propertyId)
  const plan = store.ratePlans.find(
    (p) =>
      p.networkId === networkId &&
      p.propertyId === input.propertyId &&
      p.channexId === input.ratePlanChannexId,
  )
  if (!plan) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Rate plan not found in catalog',
      data: { code: 'VALIDATION' },
    })
  }

  const commandInput: SetRatePlanRestrictionsInput = {
    propertyId: input.propertyId,
    ratePlanChannexId: input.ratePlanChannexId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    fields: input.fields,
    baseSnapshotVersion: input.baseSnapshotVersion,
    propertyTimezone: property.timezone,
    propertyChannexId: property.channexId,
    compensatesIntentId: input.compensatesIntentId ?? null,
    rateMode: resolveRateMode(plan),
    parentRatePlanChannexId: plan.parentRatePlanChannexId,
  }

  if (input.previewOnly) {
    const gates = await runCommand(
      'setRatePlanRestrictions',
      { ...commandCtx(principal, input.propertyId), dryRun: true },
      commandInput,
      { store },
    )
    if (gates.status === 'rejected') throwCommandError(gates)
    try {
      assertValidDateRange(
        input.dateFrom,
        input.dateTo,
        propertyLocalToday(property.timezone),
      )
      assertFreshSnapshot(store, networkId, input.baseSnapshotVersion)
    } catch (err) {
      throwCommandError({
        error:
          err && typeof err === 'object' && 'code' in err && 'message' in err
            ? {
                code: String((err as { code: string }).code),
                message: String((err as { message: string }).message),
              }
            : { code: 'VALIDATION', message: 'Preview validation failed' },
      })
    }
    return {
      preview: true as const,
      snapshotVersion: currentSnapshotVersion(store, networkId),
      desired: input.fields,
      intent: null,
    }
  }

  const result = await runCommand(
    'setRatePlanRestrictions',
    commandCtx(principal, input.propertyId),
    commandInput,
    { store },
  )
  if (result.status !== 'ok' || !result.data) throwCommandError(result)

  const data = result.data as SetRatePlanRestrictionsResult
  if (process.env.DATABASE_URL && !result.idempotentReplay) {
    try {
      const { getDb } = await import('./auth')
      const { persistAriIntent } = await import('../lib/ari-persistence')
      const persisted = await persistAriIntent(getDb(), data.intent)
      data.intent.id = persisted.id
    } catch {
      // ponytail: memory remains until PG write-through is required in staging canary.
    }
  }

  return {
    preview: false as const,
    intent: data.intent,
    previewDiff: data.preview,
    snapshotVersion: currentSnapshotVersion(store, networkId),
  }
}

export async function setCalendarDerivedModifier(
  principal: PrincipalContext,
  input: CalendarDerivedModifierInput,
) {
  if (principal.networkId == null) {
    throw createError({ statusCode: 403, statusMessage: 'Network required' })
  }
  if (!principalCanAccessProperty(principal, input.propertyId)) {
    throw createError({ statusCode: 403, statusMessage: 'Property out of scope' })
  }

  const networkId = principal.networkId
  await ensureSecretsHydrated(networkId)
  const store = getDomainStore(networkId)

  if (!getNetworkCapabilities(store, networkId).derivedRateWrite) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Derived rate write is disabled for this network',
      data: { code: 'CAPABILITY_OFF' },
    })
  }

  const property = await resolveProperty(networkId, input.propertyId)
  const plan = store.ratePlans.find(
    (p) =>
      p.networkId === networkId &&
      p.propertyId === input.propertyId &&
      p.channexId === input.ratePlanChannexId,
  )

  const commandInput: UpdateDerivedRateModifierInput = {
    propertyId: input.propertyId,
    ratePlanChannexId: input.ratePlanChannexId,
    occupancy: input.occupancy,
    isPrimary: input.isPrimary,
    derivedOption: {
      rate: input.derivedOption.rate as UpdateDerivedRateModifierInput['derivedOption']['rate'],
    },
    baseSnapshotVersion: input.baseSnapshotVersion,
    propertyChannexId: property.channexId,
    compensatesIntentId: input.compensatesIntentId ?? null,
    rateMode: plan ? resolveRateMode(plan) : null,
  }

  if (input.previewOnly) {
    const gates = await runCommand(
      'updateDerivedRateModifier',
      { ...commandCtx(principal, input.propertyId), dryRun: true },
      commandInput,
      { store },
    )
    if (gates.status === 'rejected') throwCommandError(gates)
    try {
      assertFreshSnapshot(store, networkId, input.baseSnapshotVersion)
    } catch (err) {
      throwCommandError({
        error:
          err && typeof err === 'object' && 'code' in err && 'message' in err
            ? {
                code: String((err as { code: string }).code),
                message: String((err as { message: string }).message),
              }
            : { code: 'VALIDATION', message: 'Preview validation failed' },
      })
    }
    return {
      preview: true as const,
      snapshotVersion: currentSnapshotVersion(store, networkId),
      desired: input.derivedOption,
      intent: null,
    }
  }

  const result = await runCommand(
    'updateDerivedRateModifier',
    commandCtx(principal, input.propertyId),
    commandInput,
    { store },
  )
  if (result.status !== 'ok' || !result.data) throwCommandError(result)

  const data = result.data as UpdateDerivedRateModifierResult
  if (process.env.DATABASE_URL && !result.idempotentReplay) {
    try {
      const { getDb } = await import('./auth')
      const { persistAriIntent } = await import('../lib/ari-persistence')
      const persisted = await persistAriIntent(getDb(), data.intent)
      data.intent.id = persisted.id
    } catch {
      // ponytail: memory remains until PG write-through is required in staging canary.
    }
  }

  return {
    preview: false as const,
    intent: data.intent,
    previewDiff: data.preview,
    snapshotVersion: currentSnapshotVersion(store, networkId),
  }
}
