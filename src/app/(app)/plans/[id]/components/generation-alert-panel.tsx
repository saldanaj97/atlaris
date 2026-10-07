import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { Surface } from '@/components/ui/surface';

const PANEL_SURFACE_VARIANTS = {
  info: 'muted',
  warning: 'muted',
  destructive: 'inset',
} as const;

export function GenerationAlertPanel({
  variant,
  title,
  body,
  badge,
  meta,
  footer,
}: {
  variant: 'destructive' | 'info' | 'warning';
  title: string;
  body: ReactNode;
  badge?: string;
  meta?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Surface
      variant={PANEL_SURFACE_VARIANTS[variant]}
      padding='compact'
      className='flex flex-col gap-4'
    >
      <div>
        <h3 className='text-xl leading-7 font-semibold text-foreground'>
          {title}
        </h3>
        <p className='mt-2 text-sm leading-[22px] text-muted-foreground'>
          {body}
        </p>
      </div>
      {badge ? (
        <Badge
          variant={variant === 'destructive' ? 'destructive' : 'outline'}
          className={
            variant === 'info'
              ? 'border-link/40 bg-action-soft text-link hover:bg-action-soft'
              : variant === 'warning'
                ? 'border-warning/40 bg-warning/10 text-warning hover:bg-warning/10'
                : undefined
          }
        >
          {badge}
        </Badge>
      ) : null}
      {meta}
      {footer}
    </Surface>
  );
}
