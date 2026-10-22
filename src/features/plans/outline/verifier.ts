import type { ParsedModule } from '@/features/ai/types/parser.types';
import type { OutlineIssue } from '@/features/plans/outline/checks';
import type { GroundedCallDeps } from '@/features/plans/outline/grounded-writer';
import type { ResearchBrief } from '@/features/plans/research/contract';
import type { GenerationInput } from '@/shared/types/ai-provider.types';
import type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import {
  GROUNDED_PRESET_BY_OPERATION,
  getGroundedModelRoute,
} from '@/features/ai/model-operation-policy';
import { buildUserPrompt } from '@/features/ai/prompts';
import { ProviderInvalidResponseError } from '@/features/ai/providers/errors';
import { safeNormalizeUsage } from '@/features/ai/usage';
import {
  OUTLINE_SCOPE_CONTRACT,
  buildResearchBriefPart,
  serializeOutline,
} from '@/features/plans/outline/contract';
import { sendGroundedJsonCall } from '@/features/plans/outline/grounded-writer';
import { z } from 'zod';

/** Tagged on AI Gateway log entries. */
export const OUTLINE_VERIFY_STAGE = 'grounded-outline-verify';

/** Issues kept from one verifier call; the rest are dropped. */
export const MAX_VERIFIER_ISSUES = 20;

const BLOCK_REF_PATTERN = /^(?:plan|modules\[\d+\](?:\.tasks\[\d+\])?)$/;

const verifierOutputSchema = z.object({
  issues: z.array(
    z.object({
      code: z.string().trim().min(1),
      blockRef: z.string().trim().nullish(),
      message: z.string().trim().min(1),
    }),
  ),
});

export type OutlineVerifierRun = {
  readonly issues: OutlineIssue[];
  readonly model: string;
  readonly usage: CanonicalAIUsage;
};

/** Free runs code checks only; starter and pro also run the verifier. */
export function isOutlineVerifierAvailable(tier: SubscriptionTier): boolean {
  return getGroundedModelRoute(tier, 'outline_verify') !== null;
}

/** Verifier codes are namespaced `verifier.<code>`, lowercase snake case. */
function toVerifierCode(code: string): string {
  const slug = code
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return `verifier.${slug || 'issue'}`;
}

/** A ref outside the outline points at the whole plan. */
function toBlockRef(
  blockRef: string | null | undefined,
  modules: readonly ParsedModule[],
): string {
  if (!blockRef || !BLOCK_REF_PATTERN.test(blockRef)) {
    return 'plan';
  }
  const [moduleIndex, taskIndex] = [...blockRef.matchAll(/\[(\d+)\]/g)].map(
    (match) => Number(match[1]),
  );
  if (moduleIndex === undefined) {
    return 'plan';
  }
  const module = modules[moduleIndex];
  if (!module) {
    return 'plan';
  }
  if (taskIndex !== undefined && !module.tasks[taskIndex]) {
    return `modules[${moduleIndex}]`;
  }
  return blockRef;
}

export function parseVerifierOutput(
  value: unknown,
  modules: readonly ParsedModule[],
): OutlineIssue[] {
  const parsed = verifierOutputSchema.safeParse(value);
  if (!parsed.success) {
    throw new ProviderInvalidResponseError(
      'Outline verifier output did not match {issues:[{code, blockRef, message}]}',
    );
  }
  return parsed.data.issues.slice(0, MAX_VERIFIER_ISSUES).map((issue) => ({
    code: toVerifierCode(issue.code),
    blockRef: toBlockRef(issue.blockRef, modules),
    message: issue.message,
    source: 'verifier',
  }));
}

/** Brief first (cached, shared with the writer), then the outline to check. */
export function buildVerifierUserParts(
  input: GenerationInput,
  modules: readonly ParsedModule[],
  research: ResearchBrief | null,
) {
  return [
    ...(research ? [buildResearchBriefPart(research)] : []),
    {
      text: [
        OUTLINE_SCOPE_CONTRACT,
        '',
        buildUserPrompt(input),
        '',
        'OUTLINE (JSON):',
        serializeOutline(modules),
      ].join('\n'),
    },
  ];
}

/**
 * One verifier call on an outline (starter and pro). The verifier preset
 * holds the instructions; this sends the contract, the learner's request and
 * the outline, and returns the issues it reports. Throws on provider or
 * output errors; the workflow step owns retries.
 */
export async function runOutlineVerifier(
  params: {
    tier: SubscriptionTier;
    input: GenerationInput;
    modules: readonly ParsedModule[];
    research: ResearchBrief | null;
    signal?: AbortSignal;
  },
  deps: GroundedCallDeps = {},
): Promise<OutlineVerifierRun> {
  const models = getGroundedModelRoute(params.tier, 'outline_verify');
  if (!models) {
    throw new Error(`Outline verifier is not available for ${params.tier}`);
  }
  const { value, metadata } = await sendGroundedJsonCall(
    {
      tier: params.tier,
      models,
      presetSlug: GROUNDED_PRESET_BY_OPERATION.outline_verify.slug,
      stage: OUTLINE_VERIFY_STAGE,
      userParts: buildVerifierUserParts(
        params.input,
        params.modules,
        params.research,
      ),
      signal: params.signal,
    },
    deps,
  );
  return {
    issues: parseVerifierOutput(value, params.modules),
    model: metadata.model ?? models[0]?.modelId ?? 'unknown',
    usage: await safeNormalizeUsage(metadata),
  };
}
