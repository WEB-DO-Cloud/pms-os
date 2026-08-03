import { z } from 'zod'

export const AiProposalKinds = [
  'pricing',
  'forecast',
  'concierge',
  'ops_schedule',
] as const

export type AiProposalKind = (typeof AiProposalKinds)[number]

/** Lifecycle statuses. Apply outcomes for AI rate writes are tracked separately from generation. */
export const AiProposalStatuses = [
  'pending',
  'dismissed',
  'accepted_local',
  'applied',
  'queued',
  'reconciled',
  'partial',
  'failed',
  'stale',
] as const

export type AiProposalStatus = (typeof AiProposalStatuses)[number]

export const AiApplyRowOutcomes = [
  'queued',
  'reconciled',
  'partial',
  'failed',
  'stale',
  'skipped',
] as const

export type AiApplyRowOutcomeStatus = (typeof AiApplyRowOutcomes)[number]

export type AiProposalRecord = {
  id: string
  networkId: number
  kind: AiProposalKind
  status: AiProposalStatus
  createdAt: string
  createdByUserId: string | null
  /** Structured payload from the model (validated per kind). */
  payload: unknown
  /** Optional human note when accepted/dismissed. */
  resolutionNote: string | null
}

const stores = new Map<number, AiProposalRecord[]>()

function list(networkId: number): AiProposalRecord[] {
  let rows = stores.get(networkId)
  if (!rows) {
    rows = []
    stores.set(networkId, rows)
  }
  return rows
}

export function clearAiProposalsForTests() {
  stores.clear()
}

export function createAiProposal(input: {
  networkId: number
  kind: AiProposalKind
  payload: unknown
  createdByUserId?: string | null
}): AiProposalRecord {
  const row: AiProposalRecord = {
    id: `ai_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    networkId: input.networkId,
    kind: input.kind,
    status: 'pending',
    createdAt: new Date().toISOString(),
    createdByUserId: input.createdByUserId ?? null,
    payload: input.payload,
    resolutionNote: null,
  }
  list(input.networkId).unshift(row)
  return { ...row }
}

export function findAiProposal(
  networkId: number,
  id: string,
): AiProposalRecord | null {
  return list(networkId).find((r) => r.id === id) ?? null
}

export function listAiProposals(
  networkId: number,
  kind?: AiProposalKind,
): AiProposalRecord[] {
  return list(networkId)
    .filter((r) => (kind ? r.kind === kind : true))
    .map((r) => ({ ...r }))
}

export function updateAiProposalStatus(
  networkId: number,
  id: string,
  status: AiProposalStatus,
  resolutionNote?: string | null,
  payload?: unknown,
): AiProposalRecord {
  const row = list(networkId).find((r) => r.id === id)
  if (!row) {
    throw Object.assign(new Error('Proposal not found'), { statusCode: 404 })
  }
  row.status = status
  if (resolutionNote !== undefined) row.resolutionNote = resolutionNote
  if (payload !== undefined) row.payload = payload
  return { ...row }
}

/** Zod schemas for model output (shared by APIs + tests). */
export const pricingSuggestionRowSchema = z.object({
  propertyId: z.number(),
  ratePlanId: z.string(),
  dateFrom: z.string(),
  dateTo: z.string(),
  amountMinor: z.number().int(),
  currency: z.string().optional(),
  rationale: z.string(),
  confidence: z.number().min(0).max(1),
})

export const pricingSuggestionSchema = z.object({
  suggestions: z.array(pricingSuggestionRowSchema),
})

/** Stored pricing proposal: model rows + snapshot binding for AE8 stale checks. */
export const pricingProposalPayloadSchema = z.object({
  suggestions: z.array(pricingSuggestionRowSchema),
  baseSnapshotVersion: z.number().int().nonnegative(),
  propertyIds: z.array(z.number()),
  /** True when network aiApply was on at generation — never means generation wrote. */
  aiApplyEnabled: z.boolean().default(false),
  /** Generation never queues ARI writes; always false on suggest. */
  ariWriteEnabled: z.literal(false).default(false),
  note: z.string().optional(),
  applyOutcomes: z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        status: z.enum(AiApplyRowOutcomes),
        intentId: z.number().int().optional(),
        error: z.string().optional(),
      }),
    )
    .optional(),
})

export const forecastSchema = z.object({
  horizonDays: z.number().int().positive(),
  occupancyPct: z.number().min(0).max(100),
  revenueMinor: z.number().int(),
  narrative: z.string(),
  risks: z.array(z.string()),
})

export const conciergeDraftSchema = z.object({
  body: z.string().min(1),
  tone: z.array(z.string()).default([]),
  caution: z.string().nullable().optional(),
})

export const opsScheduleSchema = z.object({
  tasks: z.array(
    z.object({
      propertyId: z.number(),
      reservationId: z.number().nullable().optional(),
      title: z.string().min(1),
      category: z.enum(['cleaning', 'maintenance', 'inspection']),
      dueHint: z.string().nullable().optional(),
      rationale: z.string(),
    }),
  ),
})

export type PricingSuggestionPayload = z.infer<typeof pricingSuggestionSchema>
export type PricingProposalPayload = z.infer<typeof pricingProposalPayloadSchema>
export type ForecastPayload = z.infer<typeof forecastSchema>
export type ConciergeDraftPayload = z.infer<typeof conciergeDraftSchema>
export type OpsSchedulePayload = z.infer<typeof opsScheduleSchema>
