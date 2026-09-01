import type { AiPlanGenerationProvider } from '@/features/ai/types/provider.types';
import type { AdaptiveTimeoutConfig } from '@/features/ai/types/timeout.types';
import type { ModuleLessonGenerationContext } from '@/lib/db/queries/module-lesson-generation';
import type { DbClient } from '@/lib/db/types';
import type { ModuleLessonGenerationMetadata } from '@/shared/types/lesson-content.types';

export type GenerateModuleLessonsDeps = {
  readonly provider?: Pick<
    AiPlanGenerationProvider,
    'generateModuleLessonBatch'
  >;
  readonly serverDbClient?: DbClient;
  readonly resolveGenerationEnabled?: () => Promise<boolean>;
};

export type GenerateModuleLessonsResult =
  | { readonly kind: 'not_found' }
  | { readonly kind: 'locked' }
  | { readonly kind: 'already_ready' }
  | { readonly kind: 'in_flight' }
  | { readonly kind: 'disabled' }
  | { readonly kind: 'success'; readonly durationMs: number }
  | { readonly kind: 'failed' };

export type ModuleLessonGenerationWorkResult = Exclude<
  GenerateModuleLessonsResult,
  {
    readonly kind: 'not_found' | 'locked' | 'already_ready' | 'in_flight';
  }
>;

export type RunModuleLessonGenerationAfterClaimParams = {
  readonly load: ModuleLessonGenerationContext;
  readonly userId: string;
  readonly planId: string;
  readonly moduleId: string;
  readonly modelOverride?: string | null;
  readonly signal?: AbortSignal;
  readonly timeoutConfig?: Partial<AdaptiveTimeoutConfig>;
  readonly now?: () => Date;
  readonly generationMetadata?: ModuleLessonGenerationMetadata;
};
