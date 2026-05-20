import { Loader2, Sparkles } from 'lucide-react';
import type { JSX } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Surface } from '@/components/ui/surface';
import type { ModuleLessonGenerationSummary } from '@/features/plans/read-projection/types';

function getGenerationStatusLabel(
  lessonGeneration: ModuleLessonGenerationSummary,
): string {
  switch (lessonGeneration.status) {
    case 'not_generated':
      return 'Not generated';
    case 'generating':
      return 'Generating';
    case 'ready':
      return 'Ready';
    case 'failed':
      return 'Failed';
    default: {
      const _exhaustive: never = lessonGeneration.status;
      return _exhaustive;
    }
  }
}

function LockedGenerationPanel(): JSX.Element {
  return (
    <Surface variant="default" padding="none" className="mb-6 p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-muted p-2 text-muted-foreground">
          <Sparkles className="size-5" />
        </div>
        <div>
          <h3 className="font-semibold text-stone-900 dark:text-stone-100">
            Lesson generation unlocks with this module
          </h3>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Complete previous modules to unlock lesson generation.
          </p>
        </div>
      </div>
    </Surface>
  );
}

function GenerationDescription({
  lessonGeneration,
  generationTakingLong,
  quotaMessage,
}: {
  lessonGeneration: ModuleLessonGenerationSummary;
  generationTakingLong: boolean;
  quotaMessage: string | null;
}): JSX.Element {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="font-semibold text-stone-900 dark:text-stone-100">
          Detailed lesson content
        </h3>
        <Badge variant="secondary">
          {getGenerationStatusLabel(lessonGeneration)}
        </Badge>
      </div>
      {lessonGeneration.status === 'generating' ? (
        <>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            Generation is running for the full module. You can keep reviewing
            lessons, resources, and progress while content is prepared.
          </p>
          {generationTakingLong ? (
            <p className="mt-2 text-sm font-medium text-amber-700 dark:text-amber-400">
              Generation taking longer than expected
            </p>
          ) : null}
        </>
      ) : lessonGeneration.status === 'failed' ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">
          {lessonGeneration.error ??
            'Generation failed. Retry to create fresh lesson content for this module.'}
        </p>
      ) : (
        <p className="text-sm text-stone-500 dark:text-stone-400">
          One click generates and caches detailed content for every lesson in
          this module.
        </p>
      )}
      {quotaMessage ? (
        <p className="mt-2 text-sm font-medium text-amber-700 dark:text-amber-400">
          {quotaMessage}
        </p>
      ) : null}
    </div>
  );
}

function GenerationAction({
  status,
  isPending,
  onGenerate,
}: {
  status: ModuleLessonGenerationSummary['status'];
  isPending: boolean;
  onGenerate: () => void;
}): JSX.Element | null {
  if (status === 'generating') {
    return (
      <div className="flex items-center gap-2 text-sm font-medium text-primary">
        <span className="animate-spin">
          <Loader2 className="size-4" />
        </span>
        Generating
      </div>
    );
  }

  const canGenerate = status === 'not_generated' || status === 'failed';
  if (!canGenerate) {
    return null;
  }

  return (
    <Button onClick={onGenerate} disabled={isPending}>
      {isPending ? 'Generating...' : 'Generate lessons'}
    </Button>
  );
}

export function GenerationStatePanel({
  lessonGeneration,
  previousModulesComplete,
  quotaMessage,
  generationTakingLong,
  onGenerate,
  isPending,
}: {
  lessonGeneration: ModuleLessonGenerationSummary;
  previousModulesComplete: boolean;
  quotaMessage: string | null;
  generationTakingLong: boolean;
  onGenerate: () => void;
  isPending: boolean;
}): JSX.Element | null {
  if (!previousModulesComplete) {
    return <LockedGenerationPanel />;
  }

  if (lessonGeneration.status === 'ready') {
    return null;
  }

  return (
    <Surface variant="default" padding="none" className="mb-6 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <GenerationDescription
          lessonGeneration={lessonGeneration}
          generationTakingLong={generationTakingLong}
          quotaMessage={quotaMessage}
        />
        <GenerationAction
          status={lessonGeneration.status}
          isPending={isPending}
          onGenerate={onGenerate}
        />
      </div>
    </Surface>
  );
}
