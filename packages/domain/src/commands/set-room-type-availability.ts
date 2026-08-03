/**
 * Absolute room-type availability write (close/open) via the ARI outbox (U6).
 * Desired value is absolute — never a delta. Compensating reopen is a new intent.
 */
import {
  assertCapability,
  assertFreshSnapshot,
  assertValidDateRange,
  cancelQueuedIntent,
  enqueueAriIntent,
  propertyLocalToday,
} from '../ari'
import type { AriWriteIntentRecord, CommandDefinition } from '../store'

export type SetRoomTypeAvailabilityInput = {
  propertyId: number
  roomTypeId: number
  roomTypeChannexId: string
  dateFrom: string
  dateTo: string
  /** Absolute desired availability (≥ 0). Close = 0; open = explicit prior value. */
  availability: number
  baseSnapshotVersion: number
  propertyTimezone?: string | null
  compensatesIntentId?: number | null
  /** Optional; filled at send from catalog when absent. */
  propertyChannexId?: string | null
}

export type SetRoomTypeAvailabilityResult = {
  intent: AriWriteIntentRecord
  preview: {
    roomTypeChannexId: string
    dateFrom: string
    dateTo: string
    desiredAvailability: number
    supersededIntentIds: number[]
  }
}

export type AvailabilityPayloadValue = {
  property_id: string | null
  room_type_id: string
  date_from: string
  date_to: string
  availability: number
}

export type AvailabilityIntentPayload = {
  values: AvailabilityPayloadValue[]
  _local: {
    roomTypeId: number
    propertyChannexId: string | null
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

function assertAvailabilityFields(input: SetRoomTypeAvailabilityInput): void {
  if (!input.roomTypeChannexId?.trim()) {
    throw { code: 'VALIDATION', message: 'roomTypeChannexId is required' }
  }
  if (!Number.isFinite(input.roomTypeId) || input.roomTypeId < 1) {
    throw { code: 'VALIDATION', message: 'roomTypeId is required' }
  }
  if (
    !Number.isInteger(input.availability) ||
    input.availability < 0
  ) {
    throw {
      code: 'VALIDATION',
      message: 'availability must be an integer ≥ 0',
    }
  }
}

/** Idempotent key for absolute desired-state replay. */
export function availabilityIdempotencyKey(
  input: Pick<
    SetRoomTypeAvailabilityInput,
    | 'propertyId'
    | 'roomTypeChannexId'
    | 'dateFrom'
    | 'dateTo'
    | 'availability'
    | 'baseSnapshotVersion'
    | 'compensatesIntentId'
  >,
): string {
  const compensate = input.compensatesIntentId
    ? `:c${input.compensatesIntentId}`
    : ''
  return `availability:${input.propertyId}:${input.roomTypeChannexId}:${input.dateFrom}:${input.dateTo}:${input.availability}:v${input.baseSnapshotVersion}${compensate}`
}

/**
 * Cancel queued/retry intents that overlap the same property+room-type dates.
 * Already-accepted (or further) intents are left alone — AE6/compensation territory.
 */
export function supersedeOverlappingQueuedAvailability(
  store: { ariWriteIntents: AriWriteIntentRecord[] },
  networkId: number,
  propertyId: number,
  roomTypeChannexId: string,
  dateFrom: string,
  dateTo: string,
): number[] {
  const superseded: number[] = []
  for (const intent of store.ariWriteIntents) {
    if (intent.networkId !== networkId || intent.propertyId !== propertyId) continue
    if (intent.lane !== 'availability') continue
    if (intent.status !== 'queued' && intent.status !== 'retry') continue
    const scope = intent.resourceScope
    if (!scope?.roomTypeChannexId || scope.roomTypeChannexId !== roomTypeChannexId) {
      continue
    }
    if (!rangesOverlap(scope.dateFrom, scope.dateTo, dateFrom, dateTo)) continue
    cancelQueuedIntent(store, networkId, intent.id)
    superseded.push(intent.id)
  }
  return superseded
}

export const setRoomTypeAvailability: CommandDefinition<
  SetRoomTypeAvailabilityInput,
  SetRoomTypeAvailabilityResult
> = {
  name: 'setRoomTypeAvailability',
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
    assertCapability(store, ctx.networkId, 'availabilityWrite')
    assertAvailabilityFields(input)
    const today = propertyLocalToday(input.propertyTimezone)
    assertValidDateRange(input.dateFrom, input.dateTo, today)
    assertFreshSnapshot(store, ctx.networkId, input.baseSnapshotVersion)

    const supersededIntentIds = supersedeOverlappingQueuedAvailability(
      store,
      ctx.networkId,
      input.propertyId,
      input.roomTypeChannexId,
      input.dateFrom,
      input.dateTo,
    )

    const payload: AvailabilityIntentPayload = {
      values: [
        {
          property_id: input.propertyChannexId ?? null,
          room_type_id: input.roomTypeChannexId,
          date_from: input.dateFrom,
          date_to: input.dateTo,
          availability: input.availability,
        },
      ],
      _local: {
        roomTypeId: input.roomTypeId,
        propertyChannexId: input.propertyChannexId ?? null,
      },
    }

    const intent = enqueueAriIntent(store, {
      networkId: ctx.networkId,
      propertyId: input.propertyId,
      lane: 'availability',
      idempotencyKey: availabilityIdempotencyKey(input),
      payload,
      resourceScope: {
        roomTypeChannexId: input.roomTypeChannexId,
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
          roomTypeChannexId: input.roomTypeChannexId,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          desiredAvailability: input.availability,
          supersededIntentIds,
        },
      },
      resourceType: 'ari_write_intent',
      resourceId: String(intent.id),
    }
  },
}
