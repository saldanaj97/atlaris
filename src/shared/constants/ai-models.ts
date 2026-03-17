/**
 * Canonical AI model IDs and validation.
 *
 * This is the leaf-layer source of truth for model identification.
 * Feature-level metadata (names, descriptions, tiers) lives in
 * `features/ai/ai-models.ts` which re-exports from here.
 */

export const AI_DEFAULT_MODEL = 'openrouter/free';

export const AI_MODEL_IDS = [
  'openrouter/free',
  'google/gemini-2.0-flash-exp:free',
  'openai/gpt-oss-20b:free',
  'alibaba/tongyi-deepresearch-30b-a3b:free',
  'anthropic/claude-haiku-4.5',
  'google/gemini-2.5-flash-lite',
  'google/gemini-3-flash-preview',
  'google/gemini-3-pro-preview',
  'anthropic/claude-sonnet-4.5',
  'openai/gpt-4o-mini-2024-07-18',
  'openai/gpt-4o-mini-search-preview',
  'openai/gpt-4o',
  'openai/gpt-5.1',
  'openai/gpt-5.2',
] as const;

export type AiModelId = (typeof AI_MODEL_IDS)[number];

const MODEL_ID_SET: ReadonlySet<string> = new Set(AI_MODEL_IDS);

export function isValidModelId(id: string): boolean {
  return MODEL_ID_SET.has(id);
}
