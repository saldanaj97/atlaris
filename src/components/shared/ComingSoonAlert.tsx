import type { LucideIcon } from 'lucide-react';
import { Sparkles } from 'lucide-react';
import type { JSX } from 'react';

import { cn } from '@/lib/utils';

interface ComingSoonAlertProps {
  /** Heading text displayed in the alert */
  title: string;
  /** Supporting copy explaining what's coming */
  description: string;
  /** Leading icon – defaults to Sparkles */
  icon?: LucideIcon;
  /** Extra Tailwind classes forwarded to the root element */
  className?: string;
}

export function ComingSoonAlert({
  title,
  description,
  icon: Icon = Sparkles,
  className,
}: ComingSoonAlertProps): JSX.Element {
  return (
    <div
      role="status"
      className={cn(
        'relative flex items-start gap-4 overflow-hidden rounded-2xl border border-white/40 bg-white/30 px-5 py-4 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-stone-900/30',
        className
      )}
    >
      <div className="gradient-glow absolute -top-12 -right-12 h-32 w-32 opacity-30" />

      <div className="gradient-brand-interactive flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-md">
        <Icon className="h-4 w-4 text-white" aria-hidden="true" />
      </div>
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}
