'use client';

import { useOffscreenPause } from '@/app/(landing)/_shared/useOffscreenPause';
import { cn } from '@/lib/utils';
import { useRef } from 'react';

import styles from './landing.module.css';

export function HeroStars() {
  const ref = useRef<HTMLDivElement>(null);
  useOffscreenPause(ref);

  return (
    // oxlint-disable-next-line shadcn/require-static-classes -- CSS module classes are complete but opaque to the rule
    <div
      ref={ref}
      className={cn(styles.layer, styles.stars)}
      aria-hidden='true'
      data-offscreen-pause=''
    />
  );
}
