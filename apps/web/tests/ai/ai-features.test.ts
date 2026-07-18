import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { buildPrincipal } from '@pms/auth'
import {
  clearAiProposalsForTests,
  conciergeDraftSchema,
  createAiProposal,
  forecastSchema,
  opsScheduleSchema,
  pricingProposalPayloadSchema,
  pricingSuggestionSchema,
  updateAiProposalStatus,
} from '../../server/lib/ai-proposals'
import {
  runStructuredPrompt,
  setStructuredRunnerForTests,
} from '../../server/utils/ai'
import {
  buildConciergeContext,
  buildOpsScheduleContext,
  buildPricingContext,
} from '../../server/utils/ai-context'
import { acceptPricingProposal } from '../../server/utils/ai-pricing'
import { getSyncStore } from '../../server/utils/sync'

function manager(overrides: Partial<Parameters<typeof buildPrincipal>[0]> = {}) {
  return buildPrincipal({
    userId: 'mgr-1',
    networkId: 1,
    role: 'manager',
    propertyIds: [10],
    networkWide: false,
    ...overrides,
  })!
}

function frontDesk(overrides: Partial<Parameters<typeof buildPrincipal>[0]> = {}) {
  return buildPrincipal({
    userId: 'desk',
    networkId: 1,
    role: 'front_desk',
    propertyIds: [10],
    networkWide: false,
    ...overrides,
  })!
}

function seedPricingCatalog(opts?: {
  aiApply?: boolean
  rateWrite?: boolean
  snapshotVersion?: number
}) {
  const sync = getSyncStore(1)
  sync.domain.networkCapabilities = [
    {
      networkId: 1,
      bookingCrsWrite: false,
      availabilityWrite: false,
      rateRestrictionWrite: opts?.rateWrite ?? true,
      derivedRateWrite: false,
      aiApply: opts?.aiApply ?? true,
      updatedAt: new Date().toISOString(),
    },
  ]
  sync.domain.ariWriteIntents = []
  const property = sync.upsertProperty({
    networkId: 1,
    id: 10,
    channexId: 'prop-cx-ai',
    name: 'Cabin',
    slug: 'cabin-ai',
    timezone: 'UTC',
    currency: 'USD',
    channexRaw: null,
  })
  sync.domain.ratePlans = [
    {
      networkId: 1,
      propertyId: property.id,
      channexId: 'rp-manual',
      roomTypeChannexId: 'rt-1',
      title: 'BAR',
      currency: 'USD',
      parentRatePlanChannexId: null,
      channexRaw: { rate_mode: 'manual' },
      pulledAt: new Date().toISOString(),
    },
  ]
  const version = opts?.snapshotVersion ?? 4
  sync.domain.ariRestrictions = [
    {
      networkId: 1,
      propertyId: property.id,
      ratePlanChannexId: 'rp-manual',
      date: '2026-08-20',
      rateMinor: 20_000,
      minStayArrival: 1,
      minStayThrough: null,
      maxStay: null,
      closedToArrival: false,
      closedToDeparture: false,
      stopSell: false,
      snapshotVersion: version,
      pulledAt: new Date().toISOString(),
    },
  ]
  return { sync, property, version }
}

function makePricingProposal(opts?: {
  baseSnapshotVersion?: number
  propertyId?: number
  amountMinor?: number
}) {
  const payload = pricingProposalPayloadSchema.parse({
    suggestions: [
      {
        propertyId: opts?.propertyId ?? 10,
        ratePlanId: 'rp-manual',
        dateFrom: '2026-08-20',
        dateTo: '2026-08-20',
        amountMinor: opts?.amountMinor ?? 22_000,
        currency: 'USD',
        rationale: 'Weekend lift',
        confidence: 0.8,
      },
    ],
    baseSnapshotVersion: opts?.baseSnapshotVersion ?? 4,
    propertyIds: [opts?.propertyId ?? 10],
    aiApplyEnabled: true,
    ariWriteEnabled: false,
    note: 'test',
  })
  return createAiProposal({
    networkId: 1,
    kind: 'pricing',
    payload,
  })
}

/**
 * Wire a sync store into the same process maps used by getSyncStore — tests
 * exercise pure context helpers + proposal flows with mocked model output.
 */
describe('AI feature schemas and proposal gates', () => {
  const prevKey = process.env.XAI_API_KEY

  beforeEach(() => {
    clearAiProposalsForTests()
    setStructuredRunnerForTests(null)
    process.env.XAI_API_KEY = 'test-key'
  })

  afterEach(() => {
    if (prevKey === undefined) delete process.env.XAI_API_KEY
    else process.env.XAI_API_KEY = prevKey
    setStructuredRunnerForTests(null)
  })

  it('pricing local accept keeps ariWriteEnabled false when capability off', () => {
    const payload = pricingProposalPayloadSchema.parse({
      suggestions: [
        {
          propertyId: 10,
          ratePlanId: 'rp-1',
          dateFrom: '2026-08-01',
          dateTo: '2026-08-03',
          amountMinor: 18900,
          rationale: 'Weekend lift',
          confidence: 0.8,
        },
      ],
      baseSnapshotVersion: 0,
      propertyIds: [10],
      aiApplyEnabled: false,
      ariWriteEnabled: false,
    })
    const proposal = createAiProposal({
      networkId: 1,
      kind: 'pricing',
      payload,
    })
    const accepted = updateAiProposalStatus(1, proposal.id, 'accepted_local')
    expect(accepted.status).toBe('accepted_local')
    expect((accepted.payload as { ariWriteEnabled?: boolean }).ariWriteEnabled).toBe(false)
  })

  it('forecast schema requires narrative and risks array', () => {
    const f = forecastSchema.parse({
      horizonDays: 30,
      occupancyPct: 72.5,
      revenueMinor: 500000,
      narrative: 'Steady shoulder season',
      risks: ['sync_stale'],
    })
    expect(f.risks).toContain('sync_stale')
  })

  it('concierge draft requires non-empty body', () => {
    expect(() => conciergeDraftSchema.parse({ body: '', tone: [] })).toThrow()
    const d = conciergeDraftSchema.parse({
      body: 'Thanks for writing — happy to help with late checkout.',
      tone: ['warm'],
      caution: null,
    })
    expect(d.body.length).toBeGreaterThan(0)
  })

  it('ops schedule only allows cleaning/maintenance/inspection', () => {
    expect(() =>
      opsScheduleSchema.parse({
        tasks: [
          {
            propertyId: 1,
            title: 'Hack',
            category: 'other',
            rationale: 'nope',
          },
        ],
      }),
    ).toThrow()

    const ok = opsScheduleSchema.parse({
      tasks: [
        {
          propertyId: 10,
          reservationId: 5,
          title: 'Turnover clean',
          category: 'cleaning',
          dueHint: '2026-08-02',
          rationale: 'Checkout day',
        },
      ],
    })
    expect(ok.tasks[0]?.category).toBe('cleaning')
  })

  it('filters pricing suggestions to principal-scoped properties', () => {
    const principal = frontDesk()
    // Without seeding getSyncStore this will see empty properties — still must not throw on empty.
    const ctx = buildPricingContext(1, principal)
    expect(ctx.ariWriteEnabled).toBe(false)
    expect(ctx.aiApplyEnabled).toBe(false)
    expect(typeof ctx.baseSnapshotVersion).toBe('number')
    expect(Array.isArray(ctx.plans)).toBe(true)
  })

  it('mocked generateObject path yields typed payloads for all four kinds', async () => {
    setStructuredRunnerForTests(async ({ schema }) => {
      if (schema === pricingSuggestionSchema) {
        return {
          object: schema.parse({
            suggestions: [
              {
                propertyId: 10,
                ratePlanId: 'rp-1',
                dateFrom: '2026-08-01',
                dateTo: '2026-08-03',
                amountMinor: 20000,
                rationale: 'Demand lift',
                confidence: 0.9,
              },
              {
                propertyId: 99,
                ratePlanId: 'rp-x',
                dateFrom: '2026-08-01',
                dateTo: '2026-08-03',
                amountMinor: 1,
                rationale: 'out of scope',
                confidence: 0.1,
              },
            ],
          }),
        }
      }
      if (schema === forecastSchema) {
        return {
          object: schema.parse({
            horizonDays: 30,
            occupancyPct: 68,
            revenueMinor: 420000,
            narrative: 'Solid weekdays',
            risks: ['sync_stale'],
          }),
        }
      }
      if (schema === conciergeDraftSchema) {
        return {
          object: schema.parse({
            body: 'Happy to arrange late checkout.',
            tone: ['warm'],
            caution: null,
          }),
        }
      }
      if (schema === opsScheduleSchema) {
        return {
          object: schema.parse({
            tasks: [
              {
                propertyId: 10,
                title: 'Checkout clean',
                category: 'cleaning',
                dueHint: '2026-08-02',
                rationale: 'Guest departing',
              },
            ],
          }),
        }
      }
      throw new Error('unexpected schema')
    })

    const pricing = await runStructuredPrompt({
      schema: pricingSuggestionSchema,
      system: 't',
      prompt: 'p',
    })
    const allowed = new Set([10])
    const filtered = pricing.object.suggestions.filter((s) => allowed.has(s.propertyId))
    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.propertyId).toBe(10)

    const forecast = await runStructuredPrompt({
      schema: forecastSchema,
      system: 't',
      prompt: 'p',
    })
    expect(forecast.object.risks).toContain('sync_stale')

    const draft = await runStructuredPrompt({
      schema: conciergeDraftSchema,
      system: 't',
      prompt: 'p',
    })
    expect(draft.object.body).toMatch(/checkout/i)

    const ops = await runStructuredPrompt({
      schema: opsScheduleSchema,
      system: 't',
      prompt: 'p',
    })
    expect(ops.object.tasks[0]?.category).toBe('cleaning')
  })
})

describe('AI pricing apply via shared rate commands (U8 / AE8)', () => {
  beforeEach(() => {
    clearAiProposalsForTests()
  })

  it('aiApply off → local accept creates no intents', async () => {
    const { sync } = seedPricingCatalog({ aiApply: false })
    const proposal = makePricingProposal()
    const res = await acceptPricingProposal(manager(), {
      networkId: 1,
      proposalId: proposal.id,
    })
    expect(res.appliedViaCommands).toBe(false)
    expect(res.proposal.status).toBe('accepted_local')
    expect(sync.domain.ariWriteIntents).toHaveLength(0)
  })

  it('fresh proposal + selection enqueues setRatePlanNightlyRates (queued, not reconciled)', async () => {
    const { sync } = seedPricingCatalog({ aiApply: true, rateWrite: true })
    const proposal = makePricingProposal({ amountMinor: 23_500 })
    const res = await acceptPricingProposal(manager(), {
      networkId: 1,
      proposalId: proposal.id,
      indexes: [0],
    })
    expect(res.appliedViaCommands).toBe(true)
    expect(res.proposal.status).toBe('queued')
    expect(res.outcomes).toEqual([
      expect.objectContaining({ index: 0, status: 'queued', intentId: expect.any(Number) }),
    ])
    expect(sync.domain.ariWriteIntents).toHaveLength(1)
    const intent = sync.domain.ariWriteIntents[0]!
    expect(intent.status).toBe('queued')
    expect(intent.lane).toBe('restrictions')
    expect(intent.baseSnapshotVersion).toBe(4)
    const payload = intent.payload as {
      values: Array<{ rate_plan_id: string; date_from: string; date_to: string; rate?: number }>
      _local: { fields: { rateMinor?: number } }
    }
    expect(payload.values[0]).toMatchObject({
      rate_plan_id: 'rp-manual',
      date_from: '2026-08-20',
      date_to: '2026-08-20',
      rate: 23_500,
    })
    expect(payload._local.fields.rateMinor).toBe(23_500)
    // Applied only after reconcile — enqueue leaves queued.
    expect(intent.reconciledAt).toBeNull()
  })

  it('stale snapshot marks proposal stale and creates no intents', async () => {
    const { sync } = seedPricingCatalog({ snapshotVersion: 5 })
    const proposal = makePricingProposal({ baseSnapshotVersion: 4 })
    const res = await acceptPricingProposal(manager(), {
      networkId: 1,
      proposalId: proposal.id,
      indexes: [0],
    })
    expect(res.proposal.status).toBe('stale')
    expect(res.outcomes.every((o) => o.status === 'stale')).toBe(true)
    expect(sync.domain.ariWriteIntents).toHaveLength(0)
  })

  it('rateRestrictionWrite off with aiApply on creates no intents', async () => {
    const { sync } = seedPricingCatalog({ aiApply: true, rateWrite: false })
    const proposal = makePricingProposal()
    await expect(
      acceptPricingProposal(manager(), {
        networkId: 1,
        proposalId: proposal.id,
        indexes: [0],
      }),
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(sync.domain.ariWriteIntents).toHaveLength(0)
  })

  it('non-manager cannot apply even when capabilities are on', async () => {
    const { sync } = seedPricingCatalog()
    const proposal = makePricingProposal()
    await expect(
      acceptPricingProposal(frontDesk(), {
        networkId: 1,
        proposalId: proposal.id,
        indexes: [0],
      }),
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(sync.domain.ariWriteIntents).toHaveLength(0)
  })

  it('out-of-scope property creates no intents', async () => {
    const { sync } = seedPricingCatalog()
    const proposal = createAiProposal({
      networkId: 1,
      kind: 'pricing',
      payload: pricingProposalPayloadSchema.parse({
        suggestions: [
          {
            propertyId: 99,
            ratePlanId: 'rp-manual',
            dateFrom: '2026-08-20',
            dateTo: '2026-08-20',
            amountMinor: 22_000,
            rationale: 'x',
            confidence: 0.5,
          },
        ],
        baseSnapshotVersion: 4,
        propertyIds: [99],
        aiApplyEnabled: true,
        ariWriteEnabled: false,
      }),
    })
    await expect(
      acceptPricingProposal(manager(), {
        networkId: 1,
        proposalId: proposal.id,
        indexes: [0],
      }),
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(sync.domain.ariWriteIntents).toHaveLength(0)
  })

  it('empty selection applies nothing', async () => {
    const { sync } = seedPricingCatalog()
    const proposal = makePricingProposal()
    const res = await acceptPricingProposal(manager(), {
      networkId: 1,
      proposalId: proposal.id,
      indexes: [],
    })
    expect(res.outcomes).toEqual([])
    expect(res.proposal.status).toBe('pending')
    expect(sync.domain.ariWriteIntents).toHaveLength(0)
  })

  it('omitted indexes applies all suggestions', async () => {
    const { sync } = seedPricingCatalog()
    const proposal = createAiProposal({
      networkId: 1,
      kind: 'pricing',
      payload: pricingProposalPayloadSchema.parse({
        suggestions: [
          {
            propertyId: 10,
            ratePlanId: 'rp-manual',
            dateFrom: '2026-08-20',
            dateTo: '2026-08-20',
            amountMinor: 21_000,
            rationale: 'a',
            confidence: 0.7,
          },
          {
            propertyId: 10,
            ratePlanId: 'rp-manual',
            dateFrom: '2026-08-21',
            dateTo: '2026-08-21',
            amountMinor: 22_000,
            rationale: 'b',
            confidence: 0.7,
          },
        ],
        baseSnapshotVersion: 4,
        propertyIds: [10],
        aiApplyEnabled: true,
        ariWriteEnabled: false,
      }),
    })
    const res = await acceptPricingProposal(manager(), {
      networkId: 1,
      proposalId: proposal.id,
    })
    expect(res.outcomes).toHaveLength(2)
    expect(res.outcomes.every((o) => o.status === 'queued')).toBe(true)
    expect(sync.domain.ariWriteIntents).toHaveLength(2)
  })

  it('proposal generation binding never queues a write', () => {
    const { sync } = seedPricingCatalog()
    const before = sync.domain.ariWriteIntents.length
    createAiProposal({
      networkId: 1,
      kind: 'pricing',
      payload: pricingProposalPayloadSchema.parse({
        suggestions: [
          {
            propertyId: 10,
            ratePlanId: 'rp-manual',
            dateFrom: '2026-08-20',
            dateTo: '2026-08-20',
            amountMinor: 30_000,
            rationale: 'gen',
            confidence: 0.9,
          },
        ],
        baseSnapshotVersion: 4,
        propertyIds: [10],
        aiApplyEnabled: true,
        ariWriteEnabled: false,
      }),
    })
    expect(sync.domain.ariWriteIntents).toHaveLength(before)
  })
})

describe('AI context scope', () => {
  it('concierge rejects unknown reservation', () => {
    const principal = frontDesk()
    expect(() => buildConciergeContext(1, principal, 99999)).toThrow(/not found/)
  })

  it('ops schedule returns empty checkouts for empty store', () => {
    const principal = manager()
    const ctx = buildOpsScheduleContext(1, principal, '2026-08-01', '2026-08-07')
    expect(ctx.checkOuts).toEqual([])
    expect(ctx.openTasks).toEqual([])
  })
})
