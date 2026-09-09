import type { ReactNode } from 'react';

import { StarField } from '@/app/(landing)/_shared/StarField';
import { APP_SHELL_HEADER_TUCK } from '@/components/layout/app-shell-width';
import { cn } from '@/lib/utils';

const orbPresets = {
  landing: {
    primary:
      'absolute -top-24 right-[8%] size-136 rounded-full bg-primary/15 blur-3xl md:size-168',
    muted:
      'absolute top-[48%] -left-28 size-112 rounded-full bg-panel-muted/50 blur-3xl md:size-144',
  },
  dusk: {
    primary:
      'absolute -top-28 right-[8%] size-120 rounded-full bg-primary/15 blur-3xl md:size-152',
    muted:
      'absolute bottom-[-10%] -left-24 size-112 rounded-full bg-panel-muted/60 blur-3xl md:size-136',
  },
} as const;

/** Marketing-page atmosphere: fixed-header tuck, two orbs, and the shared star field. */
export function CelestialBackdrop({
  variant,
  primaryClassName,
  mutedClassName,
}: {
  variant: keyof typeof orbPresets;
  primaryClassName?: string;
  mutedClassName?: string;
}): ReactNode {
  const orbs = orbPresets[variant];

  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden text-foreground ${APP_SHELL_HEADER_TUCK}`}
      aria-hidden='true'
    >
      <div className={cn(orbs.primary, primaryClassName)} />
      <div className={cn(orbs.muted, mutedClassName)} />
      <StarField />
    </div>
  );
}
