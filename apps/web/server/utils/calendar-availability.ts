import { principalCanAccessProperty, type PrincipalContext } from '@pms/auth'
import {
  assertFreshSnapshot,
  assertValidDateRange,
  currentSnapshotVersion,
  getNetworkCapabilities,
  propertyLocalToday,
  runCommand,
  type SetRoomTypeAvailabilityInput,
  type SetRoomTypeAvailabilityResult,
} from '@pms/domain'
import { createError } from 'h3'
import { commandCtx, getDomainStore } from './reservations'
import { ensureSecretsHydrated, getSyncStore } from './sync'

export type CalendarAvailabilityInput = {
  propertyId: number
  roomTypeId: number
  dateFrom: string
  dateTo: string
  availability: number
  baseSnapshotVersion: number
  compensatesIntentId?: number | null
  previewOnly?: boolean
}

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
    statusMessage: result.error?.message ?? 'Availability write failed',
    data: result,
  })
}

/**
 * Preview or enqueue absolute room-type availability (U6).
 * Preview uses dryRun — validates gates/snapshot without enqueue.
 */
export async function setCalendarAvailability(
  principal: PrincipalContext,
  input: CalendarAvailabilityInput,
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
  const sync = getSyncStore(networkId)

  if (!getNetworkCapabilities(store, networkId).availabilityWrite) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Availability write is disabled for this network',
      data: { code: 'CAPABILITY_OFF' },
    })
  }

  const roomType = sync
    .listRoomTypes(networkId, input.propertyId)
    .find((r) => r.id === input.roomTypeId)
  if (!roomType) {
    throw createError({
      statusCode: 400,
      statusMessage: 'roomTypeId not found on this property',
      data: { code: 'VALIDATION' },
    })
  }

  const property = sync
    .listProperties(networkId)
    .find((p) => p.id === input.propertyId)
  if (!property) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Property not found',
      data: { code: 'VALIDATION' },
    })
  }

  const commandInput: SetRoomTypeAvailabilityInput = {
    propertyId: input.propertyId,
    roomTypeId: input.roomTypeId,
    roomTypeChannexId: roomType.channexId,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    availability: input.availability,
    baseSnapshotVersion: input.baseSnapshotVersion,
    propertyTimezone: property.timezone,
    propertyChannexId: property.channexId,
    compensatesIntentId: input.compensatesIntentId ?? null,
  }

  if (input.previewOnly) {
    // Privilege/module gates via dry-run; snapshot/date validation explicit (R22).
    const gates = await runCommand(
      'setRoomTypeAvailability',
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
    const current = currentSnapshotVersion(store, networkId)
    const currentAvailability = store.ariAvailability
      .filter(
        (a) =>
          a.networkId === networkId &&
          a.propertyId === input.propertyId &&
          a.roomTypeChannexId === roomType.channexId &&
          a.date >= input.dateFrom &&
          a.date <= input.dateTo,
      )
      .map((a) => ({ date: a.date, availability: a.availability }))
    return {
      preview: true as const,
      snapshotVersion: current,
      stale: false,
      desiredAvailability: input.availability,
      roomTypeChannexId: roomType.channexId,
      currentAvailability,
      intent: null,
    }
  }

  const result = await runCommand(
    'setRoomTypeAvailability',
    commandCtx(principal, input.propertyId),
    commandInput,
    { store },
  )
  if (result.status !== 'ok' || !result.data) throwCommandError(result)

  const data = result.data as SetRoomTypeAvailabilityResult
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
