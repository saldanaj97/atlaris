import type { ModuleLessonGenerationContext } from '@/lib/db/queries/module-lesson-generation';
import type { SubscriptionTier } from '@/shared/types/billing.types';

/** Serializable workflow input for module lesson generation. */
export type ModuleLessonWorkflowInput = {
  readonly userId: string;
  readonly planId: string;
  readonly moduleId: string;
  readonly userTier: SubscriptionTier;
  readonly modelOverride?: string;
  readonly correlationId: string;
};

type ModuleLessonWorkflowRunResultBase = {
  readonly runId: string;
};

export type ModuleLessonWorkflowClaimStepResult =
  | (ModuleLessonWorkflowRunResultBase & {
      readonly kind: 'claimed';
      readonly load: ModuleLessonGenerationContext;
    })
  | (ModuleLessonWorkflowRunResultBase & { readonly kind: 'already_ready' })
  | (ModuleLessonWorkflowRunResultBase & { readonly kind: 'in_flight' })
  | (ModuleLessonWorkflowRunResultBase & { readonly kind: 'not_found' })
  | (ModuleLessonWorkflowRunResultBase & { readonly kind: 'locked' })
  | (ModuleLessonWorkflowRunResultBase & { readonly kind: 'disabled' });

export type ModuleLessonWorkflowResult =
  | ModuleLessonWorkflowClaimStepResult
  | (ModuleLessonWorkflowRunResultBase & {
      readonly kind: 'success';
      readonly durationMs: number;
    })
  | (ModuleLessonWorkflowRunResultBase & {
      readonly kind: 'failed';
      readonly message: string;
    })
  | (ModuleLessonWorkflowRunResultBase & {
      readonly kind: 'quota_denied';
      readonly currentCount: number;
      readonly limit: number;
    });
