/**
 * Durable plan-generation purpose. Persist this on generation_attempts and
 * thread it through lifecycle/workflow boundaries. Do not infer it from
 * usageKind, route names, mutable metadata, or request overrides after rollout.
 */
export const GENERATION_PURPOSES = ['initial', 'regeneration'] as const;

export type GenerationPurpose = (typeof GENERATION_PURPOSES)[number];

const GENERATION_PURPOSE_SET: ReadonlySet<string> = new Set(
  GENERATION_PURPOSES,
);

export function isGenerationPurpose(
  value: unknown,
): value is GenerationPurpose {
  return typeof value === 'string' && GENERATION_PURPOSE_SET.has(value);
}

export function parseGenerationPurpose(value: unknown): GenerationPurpose {
  if (!isGenerationPurpose(value)) {
    throw new Error(`Invalid generation purpose: ${String(value)}`);
  }
  return value;
}

/**
 * Temporary expand-window helper for serialized reservations that predate
 * `generationPurpose`. Missing resolves to `fallback`; an explicit value is
 * parsed as any valid GenerationPurpose.
 *
 * Workflow payload classification must use the trusted boundary resolvers,
 * which reject an explicit purpose that does not match that workflow.
 * Do not use this to infer purpose from usageKind, routes, or metadata.
 */
export function resolveLegacyWorkflowGenerationPurpose(
  rawPurpose: unknown,
  fallback: GenerationPurpose,
): GenerationPurpose {
  if (rawPurpose === undefined) {
    return fallback;
  }
  return parseGenerationPurpose(rawPurpose);
}

export function describeGenerationPurpose(purpose: GenerationPurpose): string {
  switch (purpose) {
    case 'initial':
      return 'initial';
    case 'regeneration':
      return 'regeneration';
    default: {
      const _never: never = purpose;
      throw new Error(`Unhandled generation purpose: ${String(_never)}`);
    }
  }
}
