/**
 * Canonical AI model IDs and validation.
 *
 * This is the leaf-layer source of truth for model identification.
 * Feature-level metadata (names, descriptions, tiers) lives in
 * `features/ai/ai-models.ts` which re-exports from here.
 */

export const AI_DEFAULT_MODEL = 'openrouter/free';

const AI_MODEL_IDS = [
  'openrouter/free',
  'openai/gpt-6-luna',
  'anthropic/claude-haiku-5.5',
  'deepseek/deepseek-v4.1-flash',
  'openai/gpt-6.1-sol',
  'openai/gpt-6-sol',
  'anthropic/claude-sonnet-5.5',
  'anthropic/claude-opus-5.5',
] as const;

const MODEL_ID_SET: ReadonlySet<string> = new Set(AI_MODEL_IDS);

export function isValidModelId(id: string): boolean {
  return MODEL_ID_SET.has(id);
}
