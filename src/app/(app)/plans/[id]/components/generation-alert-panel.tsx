import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { Surface } from '@/components/ui/surface';
import { cn } from '@/lib/utils';

const PANEL_VARIANT_CLASSES = {
  info: {
    surface: 'muted' as const,
    badge: 'border-link/40 bg-action-soft text-link hover:bg-action-soft',
  },
  warning: {
    surface: 'muted' as const,
    badge: 'border-warning/40 bg-warning/10 text-warning hover:bg-warning/10',
  },
  destructive: {
    surface: 'inset' as const,
    badge: undefined,
  },
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
  const classes = PANEL_VARIANT_CLASSES[variant];

  return (
    <Surface
      variant={classes.surface}
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
          className={cn(classes.badge)}
        >
          {badge}
        </Badge>
      ) : null}
      {meta}
      {footer}
    </Surface>
  );
}
