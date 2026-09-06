'use client';

import { cn } from '@/lib/utils';
import * as ProgressPrimitive from '@radix-ui/react-progress';
import * as React from 'react';

function Progress({
  className,
  value,
  max,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  const normalizedMax = normalizeMax(max);
  const normalizedValue = normalizeValue(value, normalizedMax);

  return (
    <ProgressPrimitive.Root
      data-slot='progress'
      value={normalizedValue}
      max={normalizedMax}
      className={cn(
        'relative h-2 w-full overflow-hidden rounded-full border border-input bg-panel',
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot='progress-indicator'
        className='h-full w-full flex-1 bg-action-primary transition-[transform] data-[state=indeterminate]:w-1/2 data-[state=indeterminate]:translate-x-0 data-[state=indeterminate]:animate-pulse motion-reduce:animate-none motion-reduce:transition-none'
        style={
          normalizedValue === null
            ? undefined
            : {
                transform: `translateX(-${100 - (normalizedValue / normalizedMax) * 100}%)`,
              }
        }
      />
    </ProgressPrimitive.Root>
  );
}

function normalizeMax(max: number | undefined): number {
  return typeof max === 'number' && Number.isFinite(max) && max > 0 ? max : 100;
}

function normalizeValue(
  value: number | null | undefined,
  max: number,
): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }

  return Math.min(max, Math.max(0, value));
}

export { Progress };
