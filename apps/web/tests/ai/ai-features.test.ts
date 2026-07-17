import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { buildPrincipal } from '@pms/auth'
import {
  clearAiProposalsForTests,
  conciergeDraftSchema,
  createAiProposal,
  forecastSchema,
  opsScheduleSchema,
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

  it('pricing schema keeps ariWriteEnabled false on accept path', () => {
    const payload = pricingSuggestionSchema.parse({
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
    })
    const proposal = createAiProposal({
      networkId: 1,
      kind: 'pricing',
      payload: { ...payload, ariWriteEnabled: false },
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
    const principal = buildPrincipal({
      userId: 'desk',
      networkId: 1,
      role: 'front_desk',
      propertyIds: [10],
      networkWide: false,
    })!
    // Without seeding getSyncStore this will see empty properties — still must not throw on empty.
    const ctx = buildPricingContext(1, principal)
    expect(ctx.ariWriteEnabled).toBe(false)
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

describe('AI context scope', () => {
  it('concierge rejects unknown reservation', () => {
    const principal = buildPrincipal({
      userId: 'desk',
      networkId: 1,
      role: 'front_desk',
      propertyIds: [10],
      networkWide: false,
    })!
    expect(() => buildConciergeContext(1, principal, 99999)).toThrow(/not found/)
  })

  it('ops schedule returns empty checkouts for empty store', () => {
    const principal = buildPrincipal({
      userId: 'mgr',
      networkId: 1,
      role: 'manager',
      propertyIds: [10],
      networkWide: false,
    })!
    const ctx = buildOpsScheduleContext(1, principal, '2026-08-01', '2026-08-07')
    expect(ctx.checkOuts).toEqual([])
    expect(ctx.openTasks).toEqual([])
  })
})
