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
