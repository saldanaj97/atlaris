import type { ModuleLessonGenerationSummary } from '@/features/plans/read-projection/types';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Surface } from '@/components/ui/surface';
import { Loader2 } from 'lucide-react';

function getGenerationStatusLabel(
  lessonGeneration: ModuleLessonGenerationSummary,
): string {
  switch (lessonGeneration.status) {
    case 'not_generated':
      return 'Preparing';
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

function GenerationDescription({
  lessonGeneration,
  generationTakingLong,
}: {
  lessonGeneration: ModuleLessonGenerationSummary;
  generationTakingLong: boolean;
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
      {lessonGeneration.status === 'failed' ? (
        <p className='text-sm text-muted-foreground'>
          Generation failed. Retry to create fresh lesson content for this
          module.
        </p>
      ) : (
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
      )}
    </div>
  );
}

function GenerationAction({
  status,
  isPending,
  onRetry,
}: {
  status: ModuleLessonGenerationSummary['status'];
  isPending: boolean;
  onRetry: () => void;
}) {
  if (status === 'failed') {
    return (
      <Button onClick={onRetry} disabled={isPending}>
        {isPending ? 'Generating…' : 'Retry lesson generation'}
      </Button>
    );
  }

  return (
    <div className='flex items-center gap-2 text-sm font-medium text-primary'>
      <span className='animate-spin motion-reduce:animate-none'>
        <Loader2 className='size-4' />
      </span>
      Generating lessons…
    </div>
  );
}

export function GenerationStatePanel({
  lessonGeneration,
  generationTakingLong,
  onRetry,
  isPending,
}: {
  lessonGeneration: ModuleLessonGenerationSummary;
  generationTakingLong: boolean;
  onRetry: () => void;
  isPending: boolean;
}) {
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
        />
        <GenerationAction
          status={lessonGeneration.status}
          isPending={isPending}
          onRetry={onRetry}
        />
      </div>
    </Surface>
  );
}
