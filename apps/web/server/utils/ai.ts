import { createXai } from '@ai-sdk/xai'
import { generateObject, type LanguageModel } from 'ai'
import type { z } from 'zod'

/**
 * Vercel AI SDK + xAI Grok helper.
 * Feature is off when XAI_API_KEY is unset or AI_ENABLED=false.
 */

export function isAiEnabled(): boolean {
  if (process.env.AI_ENABLED === 'false') return false
  return Boolean(process.env.XAI_API_KEY?.trim())
}

export function requireAiEnabled() {
  if (!isAiEnabled()) {
    throw Object.assign(
      new Error('AI not configured — set XAI_API_KEY (optional AI_ENABLED=false to disable)'),
      { statusCode: 503 },
    )
  }
}

export function getAiModel(): LanguageModel {
  requireAiEnabled()
  const apiKey = process.env.XAI_API_KEY!.trim()
  const xai = createXai({ apiKey })
  const modelId = process.env.XAI_MODEL?.trim() || 'grok-4.5'
  return xai(modelId)
}

export type StructuredPromptInput<T extends z.ZodType> = {
  schema: T
  system: string
  prompt: string
}

type StructuredResult<T> = { object: T }

type StructuredRunner = <T extends z.ZodType>(
  input: StructuredPromptInput<T> & { model: LanguageModel },
) => Promise<StructuredResult<z.infer<T>>>

let testRunner: StructuredRunner | null = null

/** Inject a mock for unit tests (no live xAI calls). */
export function setStructuredRunnerForTests(runner: StructuredRunner | null) {
  testRunner = runner
}

export async function runStructuredPrompt<T extends z.ZodType>(
  input: StructuredPromptInput<T>,
): Promise<StructuredResult<z.infer<T>>> {
  requireAiEnabled()
  if (testRunner) {
    return testRunner({ ...input, model: getAiModel() })
  }
  const result = await generateObject({
    model: getAiModel(),
    schema: input.schema,
    system: input.system,
    prompt: input.prompt,
  })
  return { object: result.object as z.infer<T> }
}

export function toHttpError(err: unknown) {
  const e = err as { statusCode?: number; message?: string }
  return createError({
    statusCode: e.statusCode ?? 500,
    statusMessage: e.message ?? 'AI request failed',
  })
}
