'use client';

import { cn } from '@/lib/utils';
import * as React from 'react';

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode;
    color?: string;
  }
>;

/** Wraps a Recharts chart with CSS color variables derived from chart config. */
export function ChartContainer({
  className,
  children,
  config,
  style,
  ...props
}: React.ComponentProps<'div'> & {
  config: ChartConfig;
  children: React.ReactNode;
}) {
  const chartVars: React.CSSProperties &
    Partial<Record<`--color-${string}`, string>> = {};

  for (const [key, item] of Object.entries(config)) {
    if (item.color) {
      chartVars[`--color-${key}`] = item.color;
    }
  }

  return (
    <div
      data-chart
      className={cn(
        'flex aspect-video justify-center text-xs text-muted-foreground [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line]:stroke-border/70 [&_.recharts-tooltip-cursor]:stroke-border',
        className,
      )}
      style={{ ...chartVars, ...style }}
      {...props}
    >
      {children}
    </div>
  );
}

type TooltipPayload = {
  dataKey?: string | number;
  name?: string | number;
  value?: string | number;
  color?: string;
  stroke?: string;
  fill?: string;
};

/** Renders a panel tooltip listing each chart series name, color, and value. */
export function ChartTooltipContent({
  active,
  payload,
  label,
  indicator = 'dot',
  className,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string | number;
  indicator?: 'dot' | 'line';
  className?: string;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div
      className={cn(
        'grid min-w-40 gap-2 rounded-lg border border-panel-border bg-panel px-3 py-2 text-xs text-panel-foreground shadow-md',
        className,
      )}
    >
      {label ? <div className='font-medium'>{label}</div> : null}
      <div className='grid gap-1.5'>
        {payload.map((item) => {
          const color = item.color ?? item.stroke ?? item.fill;
          const itemKey =
            item.dataKey ??
            item.name ??
            `${color ?? 'value'}-${item.value ?? ''}`;

          return (
            <div
              key={itemKey}
              className='flex items-center justify-between gap-4'
            >
              <div className='flex min-w-0 items-center gap-2'>
                <span
                  className={cn(
                    'shrink-0 rounded-full',
                    indicator === 'line' ? 'h-0.5 w-4' : 'size-2',
                  )}
                  style={{ backgroundColor: color }}
                />
                <span className='min-w-0 truncate text-muted-foreground'>
                  {item.name}
                </span>
              </div>
              <span className='font-medium tabular-nums'>{item.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
