type DbEnumsModule = typeof import('../../../supabase/enums');
type SkillLevel = DbEnumsModule['skillLevel']['enumValues'][number];
type LearningStyle = DbEnumsModule['learningStyle']['enumValues'][number];

export type GenerationInput = {
  topic: string;
  notes?: string | null;
  skillLevel: SkillLevel;
  weeklyHours: number;
  learningStyle: LearningStyle;
  startDate?: string | null;
  deadlineDate?: string | null;
};

/**
 * Module lesson batch call: prompts from boundary module; `taskIds` mirrors DB
 * module order for deterministic mock payloads and later parser checks.
 */
export type ModuleLessonBatchGenerationInput = {
  userPrompt: string;
  taskIds: readonly string[];
};

export type PlanGenerationCoreFields = Pick<
  GenerationInput,
  | 'topic'
  | 'skillLevel'
  | 'learningStyle'
  | 'weeklyHours'
  | 'startDate'
  | 'deadlineDate'
>;

export type PlanGenerationCoreFieldsNormalized = Omit<
  PlanGenerationCoreFields,
  'startDate' | 'deadlineDate'
> & {
  startDate: string | null;
  deadlineDate: string | null;
};

export type ProviderUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  /**
   * OpenRouter `usage.cost` when present (USD, not credits). Parsed from the
   * final streaming chunk or non-streaming `response.usage` — see
   * `openrouter-response.ts` and `src/features/ai/openrouter-cost-contract.ts`.
   */
  providerReportedCostUsd?: number | null;
};

export type ProviderMetadata = {
  model?: string;
  provider?: string;
  usage?: ProviderUsage;
  finishReason?: string;
  freeRouterFallback?: true;
};
