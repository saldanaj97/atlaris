import type { AiPlanGenerationProvider } from '@/features/ai/types/provider.types';
import type { AdaptiveTimeoutConfig } from '@/features/ai/types/timeout.types';
import type { runLessonGenerationQuotaReserved } from '@/features/billing/lesson-generation-quota-boundary';
import type { ModuleLessonGenerationContext } from '@/lib/db/queries/module-lesson-generation';
import type { DbClient } from '@/lib/db/types';
import type { SubscriptionTier } from '@/shared/types/billing.types';
import type { ModuleLessonGenerationMetadata } from '@/shared/types/lesson-content.types';

export type GenerateModuleLessonsParams = {
  readonly dbClient: DbClient;
  readonly userId: string;
  readonly planId: string;
  readonly moduleId: string;
  readonly userTier: SubscriptionTier;
  readonly modelOverride?: string | null;
  readonly signal?: AbortSignal;
  readonly timeoutConfig?: Partial<AdaptiveTimeoutConfig>;
  readonly now?: () => Date;
  readonly generationMetadata?: ModuleLessonGenerationMetadata;
};

export type GenerateModuleLessonsDeps = {
  readonly provider?: Pick<
    AiPlanGenerationProvider,
    'generateModuleLessonBatch'
  >;
  readonly runLessonQuotaReserved?: typeof runLessonGenerationQuotaReserved;
  readonly serverDbClient?: DbClient;
};

export type GenerateModuleLessonsResult =
  | { readonly kind: 'not_found' }
  | { readonly kind: 'locked' }
  | { readonly kind: 'already_ready' }
  | { readonly kind: 'in_flight' }
  | { readonly kind: 'disabled' }
  | {
      readonly kind: 'quota_denied';
      readonly currentCount: number;
      readonly limit: number;
    }
  | { readonly kind: 'success'; readonly durationMs: number }
  | { readonly kind: 'failed'; readonly message: string };

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
  readonly userTier: SubscriptionTier;
  readonly modelOverride?: string | null;
  readonly signal?: AbortSignal;
  readonly timeoutConfig?: Partial<AdaptiveTimeoutConfig>;
  readonly now?: () => Date;
  readonly generationMetadata?: ModuleLessonGenerationMetadata;
};
