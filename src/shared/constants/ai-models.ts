/**
 * Leaf-layer model constants. Each tier's selectable models are synced from
 * its OpenRouter guardrail (`features/ai/model-catalog`), not listed here.
 */

export const AI_DEFAULT_MODEL = 'openrouter/free';

const MODEL_ID_SHAPE = /^[a-z0-9][\w.-]*\/[\w.:-]+$/i;

export function isModelIdShape(id: string): boolean {
  return MODEL_ID_SHAPE.test(id);
}
