import type { ModuleLessonGenerationSummary } from '@/features/plans/read-projection/types';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Surface } from '@/components/ui/surface';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

function getGenerationStatusLabel(
  lessonGeneration: ModuleLessonGenerationSummary,
  isFailed: boolean,
): string {
  if (isFailed) {
    return 'Failed';
  }

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
  isFailed,
}: {
  lessonGeneration: ModuleLessonGenerationSummary;
  generationTakingLong: boolean;
  isFailed: boolean;
}) {
  const badge = getGenerationStatusLabel(lessonGeneration, isFailed);

  return (
    <div className='min-w-0'>
      <h3 className='text-xl leading-7 font-semibold text-foreground'>
        Detailed lesson content
      </h3>
      {isFailed ? (
        <p className='mt-2 text-sm leading-[22px] text-muted-foreground'>
          Generation failed. Retry to create fresh lesson content for this
          module.
        </p>
      ) : (
        <p className='mt-2 text-sm leading-[22px] text-muted-foreground'>
          Generation is running for the full module. You can keep reviewing
          lessons, resources, and progress while content is prepared.
        </p>
      )}
      <div className='mt-4 flex flex-wrap items-center gap-2'>
        <Badge
          variant={isFailed ? 'destructive' : 'outline'}
          className={cn(
            !isFailed &&
              'border-link/40 bg-action-soft text-link hover:bg-action-soft',
          )}
        >
          {badge}
        </Badge>
        {generationTakingLong && !isFailed ? (
          <p className='text-sm font-medium text-warning'>
            Generation taking longer than expected
          </p>
        ) : null}
      </div>
    </div>
  );
}

function GenerationAction({
  isPending,
  isFailed,
  onRetry,
}: {
  isPending: boolean;
  isFailed: boolean;
  onRetry: () => void;
}) {
  if (isFailed) {
    return (
      <Button
        onClick={onRetry}
        disabled={isPending}
        className='w-full sm:w-auto'
      >
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

  const isFailed =
    lessonGeneration.status === 'failed' ||
    (lessonGeneration.status === 'not_generated' && !isPending);

  return (
    <Surface
      variant={isFailed ? 'inset' : 'muted'}
      padding='compact'
      className='mb-6 flex flex-col gap-4'
      aria-live='polite'
    >
      <GenerationDescription
        lessonGeneration={lessonGeneration}
        generationTakingLong={generationTakingLong}
        isFailed={isFailed}
      />
      <GenerationAction
        isPending={isPending}
        isFailed={isFailed}
        onRetry={onRetry}
      />
    </Surface>
  );
}
