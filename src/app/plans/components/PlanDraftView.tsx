'use client';

import type { StreamingPlanState } from '@/hooks/useStreamingPlanGeneration';
import { cn } from '@/lib/utils';

type PlanDraftViewProps = {
  state: StreamingPlanState;
  onCancel?: () => void;
};

export function PlanDraftView({ state, onCancel }: PlanDraftViewProps) {
  const { modules, progress, status, error } = state;

  return (
    <div className="border-border bg-card space-y-4 rounded-xl border p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground text-sm font-medium">
            Draft plan preview
          </p>
          <p className="text-sm">
            {status === 'complete'
              ? 'Plan is ready.'
              : status === 'error'
                ? 'Generation failed.'
                : 'Generating your plan...'}
          </p>
        </div>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="text-muted-foreground hover:text-foreground text-sm underline"
          >
            Cancel
          </button>
        ) : null}
      </div>

      {progress ? (
        <div
          className="text-muted-foreground flex items-center justify-between text-sm"
          aria-live="polite"
          aria-atomic="true"
        >
          <span>
            {progress.modulesParsed} of {progress.modulesTotalHint ?? '...'}{' '}
            modules planned
          </span>
        </div>
      ) : null}

      <div className="space-y-3">
        {modules.map((module) => (
          <div
            key={module.index}
            className={cn(
              'border-border bg-background rounded-lg border p-3',
              'transition-colors'
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">
                  {module.index + 1}. {module.title}
                </p>
                {module.description ? (
                  <p className="text-muted-foreground text-sm">
                    {module.description}
                  </p>
                ) : null}
              </div>
              <div className="text-muted-foreground text-right text-xs">
                <p>{module.tasksCount} tasks</p>
                <p>{module.estimatedMinutes} mins</p>
              </div>
            </div>
          </div>
        ))}

        {modules.length === 0 ? (
          <div className="text-muted-foreground text-sm">
            Modules will appear here as they are generated.
          </div>
        ) : null}
      </div>

      {error ? (
        <div
          role="alert"
          className="border-destructive/50 bg-destructive/10 text-destructive rounded-md border p-3 text-sm"
        >
          {error.message}
          {error.retryable ? ' You can try again.' : null}
        </div>
      ) : null}
    </div>
  );
}
