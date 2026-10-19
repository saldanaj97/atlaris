import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { Surface } from '@/components/ui/surface';
import { Loader2 } from 'lucide-react';

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
  busy = false,
  meta,
  footer,
}: {
  variant: 'destructive' | 'info' | 'warning';
  title: string;
  body: ReactNode;
  badge?: string;
  /** Shows a spinner beside the badge while work is still running. */
  busy?: boolean;
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
        <h3 className='type-card text-foreground'>{title}</h3>
        <p className='mt-2 type-body text-muted-foreground'>{body}</p>
      </div>
      {badge ? (
        <div className='flex flex-wrap items-center gap-2'>
          <Badge variant={variant}>{badge}</Badge>
          {busy ? (
            <Loader2
              aria-hidden='true'
              className='size-4 animate-spin text-link motion-reduce:animate-none'
            />
          ) : null}
        </div>
      ) : null}
      {meta}
      {footer}
    </Surface>
  );
}
