import type { ModuleLessonGenerationSummary } from '@/features/plans/read-projection/types';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Surface } from '@/components/ui/surface';
import { Loader2, Sparkles } from 'lucide-react';

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

function LockedGenerationPanel() {
  return (
    <Surface variant='default' padding='none' className='mb-6 p-5'>
      <div className='flex items-start gap-3'>
        <div className='rounded-lg bg-muted p-2 text-muted-foreground'>
          <Sparkles className='size-5' />
        </div>
        <div>
          <h3 className='font-semibold text-foreground'>
            Lesson generation unlocks with this module
          </h3>
          <p className='mt-1 text-sm text-muted-foreground'>
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
}) {
  return (
    <div>
      <div className='mb-2 flex items-center gap-2'>
        <h3 className='font-semibold text-foreground'>
          Detailed lesson content
        </h3>
        <Badge variant='secondary'>
          {getGenerationStatusLabel(lessonGeneration)}
        </Badge>
      </div>
      {lessonGeneration.status === 'generating' ? (
        <>
          <p className='text-sm text-muted-foreground'>
            Generation is running for the full module. You can keep reviewing
            lessons, resources, and progress while content is prepared.
          </p>
          {generationTakingLong ? (
            <p className='mt-2 text-sm font-medium text-warning'>
              Generation taking longer than expected
            </p>
          ) : null}
        </>
      ) : lessonGeneration.status === 'failed' ? (
        <p className='text-sm text-muted-foreground'>
          {lessonGeneration.error ??
            'Generation failed. Retry to create fresh lesson content for this module.'}
        </p>
      ) : (
        <p className='text-sm text-muted-foreground'>
          One click generates and caches detailed content for every lesson in
          this module.
        </p>
      )}
      {quotaMessage ? (
        <p className='mt-2 text-sm font-medium text-warning'>{quotaMessage}</p>
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
}) {
  if (status === 'generating') {
    return (
      <div className='flex items-center gap-2 text-sm font-medium text-primary'>
        <span className='animate-spin motion-reduce:animate-none'>
          <Loader2 className='size-4' />
        </span>
        Generating lessons...
      </div>
    );
  }

  const canGenerate = status === 'not_generated' || status === 'failed';
  if (!canGenerate) {
    return null;
  }

  return (
    <Button onClick={onGenerate} disabled={isPending}>
      {isPending
        ? 'Generating...'
        : status === 'failed'
          ? 'Retry lesson generation'
          : 'Generate lessons'}
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
}) {
  if (!previousModulesComplete) {
    return <LockedGenerationPanel />;
  }

  if (lessonGeneration.status === 'ready') {
    return null;
  }

  return (
    <Surface
      variant='default'
      padding='none'
      className='mb-6 p-5'
      aria-live='polite'
    >
      <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
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
