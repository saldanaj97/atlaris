import type { ModuleLessonGenerationContext } from '@/lib/db/queries/module-lesson-generation';

/** Serializable workflow input for module lesson generation. */
export type ModuleLessonWorkflowInput = {
  readonly userId: string;
  readonly planId: string;
  readonly moduleId: string;
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
      readonly startedAt: string;
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
  | (ModuleLessonWorkflowRunResultBase & { readonly kind: 'failed' });
