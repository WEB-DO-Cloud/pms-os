/**
 * Accept / apply Grok pricing proposals (U8).
 * Generation never writes; apply reuses setRatePlanNightlyRates when aiApply is on.
 */
import {
  principalCanAccessModule,
  principalCanAccessProperty,
  principalCanPerformAction,
  type PrincipalContext,
} from '@pms/auth'
import {
  assertFreshSnapshot,
  currentSnapshotVersion,
  getNetworkCapabilities,
  resolveRateMode,
  runCommand,
  type SetRatePlanNightlyRatesResult,
} from '@pms/domain'
import { createError } from 'h3'
import {
  findAiProposal,
  pricingProposalPayloadSchema,
  updateAiProposalStatus,
  type AiApplyRowOutcomeStatus,
  type AiProposalRecord,
  type AiProposalStatus,
  type PricingProposalPayload,
} from '../lib/ai-proposals'
import { commandCtx, getDomainStore } from './reservations'
import { ensureSecretsHydrated, getSyncStore } from './sync'

export type PricingApplyRowResult = {
  index: number
  status: AiApplyRowOutcomeStatus
  intentId?: number
  error?: string
}

export type AcceptPricingProposalInput = {
  networkId: number
  proposalId: string
  /** Indexes into suggestions; omit = all; [] = apply nothing. */
  indexes?: number[]
  note?: string
}

export type AcceptPricingProposalResult = {
  proposal: AiProposalRecord
  /** False when only local draft accept ran. */
  appliedViaCommands: boolean
  aiApplyEnabled: boolean
  outcomes: PricingApplyRowResult[]
  note: string
}

function throwHttp(
  statusCode: number,
  statusMessage: string,
  data?: Record<string, unknown>,
): never {
  throw createError({ statusCode, statusMessage, data })
}

async function persistIntentIfNeeded(
  intent: SetRatePlanNightlyRatesResult['intent'],
  idempotentReplay: boolean | undefined,
) {
  if (!process.env.DATABASE_URL || idempotentReplay) return intent
  try {
    const { getDb } = await import('./auth')
    const { persistAriIntent } = await import('../lib/ari-persistence')
    const persisted = await persistAriIntent(getDb(), intent)
    intent.id = persisted.id
  } catch {
    // ponytail: memory remains until PG write-through is required in staging canary.
  }
  return intent
}

/**
 * Local draft accept when aiApply is off; shared rate-command enqueue when on.
 */
export async function acceptPricingProposal(
  principal: PrincipalContext,
  input: AcceptPricingProposalInput,
): Promise<AcceptPricingProposalResult> {
  if (!principalCanAccessModule(principal, 'rates')) {
    throwHttp(403, 'Module denied')
  }

  const existing = findAiProposal(input.networkId, input.proposalId)
  if (!existing || existing.kind !== 'pricing') {
    throwHttp(404, 'Proposal not found')
  }
  if (existing.status !== 'pending') {
    throwHttp(400, `Proposal already ${existing.status}`)
  }

  const store = getDomainStore(input.networkId)
  const caps = getNetworkCapabilities(store, input.networkId)

  if (!caps.aiApply) {
    const proposal = updateAiProposalStatus(
      input.networkId,
      input.proposalId,
      'accepted_local',
      input.note ?? 'Accepted as local draft — not pushed to Channex',
    )
    return {
      proposal,
      appliedViaCommands: false,
      aiApplyEnabled: false,
      outcomes: [],
      note: 'Accepted locally only. Channex ARI write-back is not enabled.',
    }
  }

  if (!principalCanPerformAction(principal, 'ai_apply')) {
    throwHttp(403, 'Manager approval required to apply AI pricing')
  }
  if (!caps.rateRestrictionWrite) {
    throwHttp(
      403,
      'Rate/restriction write is disabled for this network',
      { code: 'CAPABILITY_OFF' },
    )
  }

  const parsed = pricingProposalPayloadSchema.parse(
    existing.payload,
  ) as PricingProposalPayload

  // Omit indexes → approve all; explicit [] → apply none.
  const indexes =
    input.indexes === undefined
      ? parsed.suggestions.map((_, i) => i)
      : input.indexes

  if (indexes.length === 0) {
    return {
      proposal: existing,
      appliedViaCommands: true,
      aiApplyEnabled: true,
      outcomes: [],
      note: 'Empty selection — nothing applied.',
    }
  }

  await ensureSecretsHydrated(input.networkId)

  try {
    assertFreshSnapshot(store, input.networkId, parsed.baseSnapshotVersion)
  } catch {
    const proposal = updateAiProposalStatus(
      input.networkId,
      input.proposalId,
      'stale',
      input.note ??
        `Snapshot ${parsed.baseSnapshotVersion} is stale (current ${currentSnapshotVersion(store, input.networkId)}); refresh and retry`,
      {
        ...parsed,
        applyOutcomes: indexes.map((index) => ({
          index,
          status: 'stale' as const,
        })),
      },
    )
    return {
      proposal,
      appliedViaCommands: true,
      aiApplyEnabled: true,
      outcomes: indexes.map((index) => ({ index, status: 'stale' as const })),
      note: 'Proposal is stale — no rate intents were queued.',
    }
  }

  const sync = getSyncStore(input.networkId)
  const outcomes: PricingApplyRowResult[] = []

  for (const i of indexes) {
    const item = parsed.suggestions[i]
    if (!item) {
      outcomes.push({ index: i, status: 'skipped', error: 'Unknown index' })
      continue
    }
    if (!principalCanAccessProperty(principal, item.propertyId)) {
      throwHttp(403, `Property ${item.propertyId} out of scope`)
    }
    if (
      parsed.propertyIds.length > 0 &&
      !parsed.propertyIds.includes(item.propertyId)
    ) {
      throwHttp(403, `Property ${item.propertyId} out of proposal scope`)
    }

    const property = sync.listProperties(input.networkId).find((p) => p.id === item.propertyId)
    if (!property) {
      outcomes.push({
        index: i,
        status: 'failed',
        error: 'Property not found',
      })
      continue
    }

    const plan = store.ratePlans.find(
      (p) =>
        p.networkId === input.networkId &&
        p.propertyId === item.propertyId &&
        p.channexId === item.ratePlanId,
    )

    const result = await runCommand(
      'setRatePlanNightlyRates',
      commandCtx(principal, item.propertyId),
      {
        propertyId: item.propertyId,
        ratePlanChannexId: item.ratePlanId,
        dateFrom: item.dateFrom,
        dateTo: item.dateTo,
        rateMinor: item.amountMinor,
        baseSnapshotVersion: parsed.baseSnapshotVersion,
        propertyTimezone: property.timezone,
        propertyChannexId: property.channexId,
        rateMode: plan ? resolveRateMode(plan) : undefined,
        parentRatePlanChannexId: plan?.parentRatePlanChannexId ?? null,
      },
      { store },
    )

    if (result.status !== 'ok' || !result.data) {
      outcomes.push({
        index: i,
        status: 'failed',
        error: result.error?.message ?? 'Rate command rejected',
      })
      continue
    }

    const data = result.data as SetRatePlanNightlyRatesResult
    await persistIntentIfNeeded(data.intent, result.idempotentReplay)
    outcomes.push({
      index: i,
      status: 'queued',
      intentId: data.intent.id,
    })
  }

  const queued = outcomes.filter((o) => o.status === 'queued').length
  const failed = outcomes.filter((o) => o.status === 'failed').length
  let status: AiProposalStatus
  if (queued === 0 && failed > 0) status = 'failed'
  else if (queued > 0 && failed > 0) status = 'partial'
  else if (queued > 0) status = 'queued'
  else status = 'failed'

  const proposal = updateAiProposalStatus(
    input.networkId,
    input.proposalId,
    status,
    input.note ??
      `Queued ${queued} rate intent(s); applied only after Channex reconciliation`,
    { ...parsed, applyOutcomes: outcomes },
  )

  return {
    proposal,
    appliedViaCommands: true,
    aiApplyEnabled: true,
    outcomes,
    note:
      status === 'queued'
        ? `Queued ${queued} rate write(s). Not reconciled until the outbox worker confirms Channex.`
        : status === 'partial'
          ? `Partial: ${queued} queued, ${failed} failed. None are applied until reconciliation.`
          : `No rate intents queued (${failed} failed).`,
  }
}
