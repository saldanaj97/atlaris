// SkillLevel / LearningStyle derived from enums here (not from db.types) to avoid
// circular: db.types → attempts.types → this file.
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
  systemPrompt: string;
  userPrompt: string;
  taskIds: readonly string[];
};

/** Core scalar fields shared across create/retry/stream/lifecycle. */
export type PlanGenerationCoreFields = Pick<
  GenerationInput,
  | 'topic'
  | 'skillLevel'
  | 'learningStyle'
  | 'weeklyHours'
  | 'startDate'
  | 'deadlineDate'
>;

/** Same as {@link PlanGenerationCoreFields} with explicit null dates after normalization. */
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
};
