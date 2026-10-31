import type { ModuleLessonGenerationSummary } from '@/features/plans/read-projection/types';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Surface } from '@/components/ui/surface';
import { Loader2 } from 'lucide-react';

/**
 * What the panel can truthfully say: a run is in progress, or it failed.
 * The module page starts generation on its own when lessons are missing, so a
 * module that still has none and has no run going got there through a failed
 * start or a run that rolled back; it reads as failed, with a retry.
 */
export type PanelState = 'failed' | 'running';

export function getPanelState(
  status: Exclude<ModuleLessonGenerationSummary['status'], 'ready'>,
  isPending: boolean,
): PanelState {
  switch (status) {
    case 'failed':
      return 'failed';
    case 'generating':
      return 'running';
    case 'not_generated':
      return isPending ? 'running' : 'failed';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function GenerationDescription({
  state,
  generationTakingLong,
}: {
  state: PanelState;
  generationTakingLong: boolean;
}) {
  const isFailed = state === 'failed';

  return (
    <div className='min-w-0'>
      <h3 className='type-card text-foreground'>Detailed lesson content</h3>
      {isFailed ? (
        <p className='mt-2 type-body text-muted-foreground'>
          Generation failed. Retry to create fresh lesson content for this
          module.
        </p>
      ) : (
        <p className='mt-2 type-body text-muted-foreground'>
          Generation is running for the full module. You can keep reviewing
          lessons, resources, and progress while content is prepared.
        </p>
      )}
      <div className='mt-4 flex flex-wrap items-center gap-2'>
        <Badge variant={isFailed ? 'destructive' : 'info'}>
          {isFailed ? 'Failed' : 'Generating'}
        </Badge>
        {generationTakingLong && !isFailed ? (
          <p className='type-label text-warning'>
            Generation taking longer than expected
          </p>
        ) : null}
      </div>
    </div>
  );
}

function GenerationAction({
  state,
  isPending,
  onRetry,
}: {
  state: PanelState;
  isPending: boolean;
  onRetry: () => void;
}) {
  if (state === 'running') {
    return (
      <div className='flex items-center gap-2 type-label text-primary'>
        <span className='animate-spin motion-reduce:animate-none'>
          <Loader2 className='size-4' />
        </span>
        Generating lessons…
      </div>
    );
  }

  return (
    <div>
      <Button variant='outline' onClick={onRetry} disabled={isPending}>
        {isPending ? 'Generating…' : 'Retry lesson generation'}
      </Button>
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

  const state = getPanelState(lessonGeneration.status, isPending);

  return (
    <Surface
      variant={state === 'failed' ? 'inset' : 'muted'}
      padding='compact'
      className='mb-6 flex flex-col gap-4'
      aria-live='polite'
    >
      <GenerationDescription
        state={state}
        generationTakingLong={generationTakingLong}
      />
      <GenerationAction state={state} isPending={isPending} onRetry={onRetry} />
    </Surface>
  );
}
