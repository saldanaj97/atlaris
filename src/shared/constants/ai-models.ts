/**
 * Leaf-layer model constants. Each tier's selectable models are synced from
 * its OpenRouter guardrail (`features/ai/model-catalog`), not listed here.
 */

/**
 * OpenRouter's free-models router. `/models/user` never lists it, so the
 * operation policy and the catalog keep it as a code-owned entry.
 */
export const AI_DEFAULT_MODEL = 'openrouter/free';

const MODEL_ID_SHAPE = /^[a-z0-9][\w.-]*\/[\w.:-]+$/i;

/** Whether `id` looks like an OpenRouter model slug (`vendor/model[:variant]`). */
export function isModelIdShape(id: string): boolean {
  return MODEL_ID_SHAPE.test(id);
}

/**
 * Models the code names as defaults or grounded routes. `AI_DEFAULT_MODEL`
 * must be one of them, so a typo fails env validation instead of a request.
 */
const CODE_OWNED_MODEL_IDS: ReadonlySet<string> = new Set([
  AI_DEFAULT_MODEL,
  'openai/gpt-6-luna',
  'anthropic/claude-haiku-5.5',
  'deepseek/deepseek-v4.1-flash',
  'openai/gpt-6.1-sol',
  'openai/gpt-6-sol',
  'anthropic/claude-sonnet-5.5',
  'anthropic/claude-opus-5.5',
]);

export function isCodeOwnedModelId(id: string): boolean {
  return CODE_OWNED_MODEL_IDS.has(id);
}
