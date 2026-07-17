import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { z } from 'zod'
import {
  clearAiProposalsForTests,
  createAiProposal,
  findAiProposal,
  listAiProposals,
  pricingSuggestionSchema,
  updateAiProposalStatus,
} from '../../server/lib/ai-proposals'
import {
  isAiEnabled,
  requireAiEnabled,
  runStructuredPrompt,
  setStructuredRunnerForTests,
} from '../../server/utils/ai'

describe('AI foundation', () => {
  const prevKey = process.env.XAI_API_KEY
  const prevEnabled = process.env.AI_ENABLED

  beforeEach(() => {
    clearAiProposalsForTests()
    setStructuredRunnerForTests(null)
    delete process.env.XAI_API_KEY
    delete process.env.AI_ENABLED
  })

  afterEach(() => {
    if (prevKey === undefined) delete process.env.XAI_API_KEY
    else process.env.XAI_API_KEY = prevKey
    if (prevEnabled === undefined) delete process.env.AI_ENABLED
    else process.env.AI_ENABLED = prevEnabled
    setStructuredRunnerForTests(null)
  })

  it('is disabled without XAI_API_KEY', () => {
    expect(isAiEnabled()).toBe(false)
    expect(() => requireAiEnabled()).toThrow(/not configured/)
  })

  it('is disabled when AI_ENABLED=false even with a key', () => {
    process.env.XAI_API_KEY = 'test-key'
    process.env.AI_ENABLED = 'false'
    expect(isAiEnabled()).toBe(false)
  })

  it('stores and resolves proposals', () => {
    const created = createAiProposal({
      networkId: 1,
      kind: 'pricing',
      payload: { suggestions: [] },
      createdByUserId: 'u1',
    })
    expect(findAiProposal(1, created.id)?.kind).toBe('pricing')
    expect(listAiProposals(1, 'pricing')).toHaveLength(1)

    const accepted = updateAiProposalStatus(1, created.id, 'accepted_local', 'draft only')
    expect(accepted.status).toBe('accepted_local')
    expect(accepted.resolutionNote).toBe('draft only')
  })

  it('runStructuredPrompt uses injected runner when enabled', async () => {
    process.env.XAI_API_KEY = 'test-key'
    setStructuredRunnerForTests(async ({ schema }) => {
      const parsed = schema.parse({
        suggestions: [
          {
            propertyId: 10,
            ratePlanId: 'rp-1',
            dateFrom: '2026-08-01',
            dateTo: '2026-08-07',
            amountMinor: 15000,
            rationale: 'Weekend demand',
            confidence: 0.7,
          },
        ],
      })
      return { object: parsed }
    })

    const { object } = await runStructuredPrompt({
      schema: pricingSuggestionSchema,
      system: 'test',
      prompt: 'suggest',
    })
    expect(object.suggestions).toHaveLength(1)
    expect(object.suggestions[0]?.amountMinor).toBe(15000)
  })

  it('rejects invalid structured payloads via zod', () => {
    expect(() =>
      pricingSuggestionSchema.parse({
        suggestions: [{ propertyId: 'x' }],
      }),
    ).toThrow()
  })
})
