import type { ParsedModule } from '@/features/ai/types/parser.types';
import type { OutlineIssue } from '@/features/plans/outline/checks';
import type {
  GroundedCallDeps,
  OutlinePurpose,
} from '@/features/plans/outline/grounded-writer';
import type { ResearchBrief } from '@/features/plans/research/contract';
import type { GenerationInput } from '@/shared/types/ai-provider.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import { GROUNDED_PRESET_SLUGS } from '@/features/ai/model-operation-policy';
import { pacePlan } from '@/features/ai/pacing';
import { parseGenerationStream } from '@/features/ai/parser';
import { buildUserPrompt } from '@/features/ai/prompts';
import { toStream } from '@/features/ai/streaming/utils';
import {
  OUTLINE_SCOPE_CONTRACT,
  buildResearchBriefPart,
  serializeOutline,
} from '@/features/plans/outline/contract';
import {
  outlineWriterModels,
  sendGroundedJsonCall,
} from '@/features/plans/outline/grounded-writer';

/** Tagged on AI Gateway log entries. */
export const OUTLINE_REPAIR_STAGE = 'grounded-outline-repair';

export type OutlineRepairRun = {
  readonly modules: ParsedModule[];
  readonly model: string;
};

export function formatIssuesForRepair(issues: readonly OutlineIssue[]): string {
  return issues
    .map((issue) => `- [${issue.blockRef}] ${issue.code}: ${issue.message}`)
    .join('\n');
}

/** Brief first (cached, shared with the writer), then the outline and issues. */
export function buildRepairUserParts(
  input: GenerationInput,
  modules: readonly ParsedModule[],
  issues: readonly OutlineIssue[],
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
        'CURRENT OUTLINE (JSON):',
        serializeOutline(modules),
        '',
        'ISSUES TO FIX (blockRef points into the outline JSON):',
        formatIssuesForRepair(issues),
        '',
        'Return the complete revised plan as JSON with the same schema. Fix the listed issues and keep everything else unchanged.',
      ].join('\n'),
    },
  ];
}

/**
 * The one outline repair pass: the writer models rewrite the outline to fix
 * the reported issues, through the repair preset and without the advisor.
 * The result goes through the same parser and pacing as the first outline.
 * Throws on provider, parse or validation errors.
 */
export async function runOutlineRepair(
  params: {
    tier: SubscriptionTier;
    purpose: OutlinePurpose;
    modelOverride?: string | null;
    input: GenerationInput;
    modules: readonly ParsedModule[];
    issues: readonly OutlineIssue[];
    research: ResearchBrief | null;
    signal?: AbortSignal;
  },
  deps: GroundedCallDeps = {},
): Promise<OutlineRepairRun> {
  const models = outlineWriterModels(
    params.tier,
    params.purpose,
    params.modelOverride,
  );
  const { value, metadata } = await sendGroundedJsonCall(
    {
      tier: params.tier,
      models,
      presetSlug: GROUNDED_PRESET_SLUGS.repair,
      stage: OUTLINE_REPAIR_STAGE,
      userParts: buildRepairUserParts(
        params.input,
        params.modules,
        params.issues,
        params.research,
      ),
      signal: params.signal,
    },
    deps,
  );
  const parsed = await parseGenerationStream(toStream(value), {
    signal: params.signal,
  });
  return {
    modules: pacePlan(parsed.modules, params.input),
    model: metadata.model ?? models[0]?.modelId ?? 'unknown',
  };
}
