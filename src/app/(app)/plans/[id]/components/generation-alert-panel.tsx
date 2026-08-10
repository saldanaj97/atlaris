import type { ReactNode } from 'react';

import { AlertCircle } from 'lucide-react';

const ALERT_VARIANT_CLASSES = {
  warning: {
    container:
      'flex items-start gap-3 rounded-lg border border-warning/20 bg-warning/10 p-4',
    icon: 'mt-0.5 size-5 shrink-0 text-warning',
    title: 'font-semibold text-warning',
  },
  destructive: {
    container:
      'flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-4',
    icon: 'mt-0.5 size-5 shrink-0 text-destructive',
    title: 'font-semibold text-destructive',
  },
} as const;

export function GenerationAlertPanel({
  variant,
  title,
  body,
  meta,
  footer,
}: {
  variant: 'destructive' | 'warning';
  title: string;
  body: ReactNode;
  meta?: ReactNode;
  footer?: ReactNode;
}) {
  const classes = ALERT_VARIANT_CLASSES[variant];

  return (
    <div className={footer ? 'space-y-4' : undefined}>
      <div className={classes.container}>
        <AlertCircle className={classes.icon} />
        <div className='space-y-1'>
          <p className={classes.title}>{title}</p>
          <p className='text-sm text-muted-foreground'>{body}</p>
          {meta}
        </div>
      </div>
      {footer}
    </div>
  );
}
