'use client';

import { useOffscreenPause } from '@/app/(landing)/_shared/useOffscreenPause';
import { cn } from '@/lib/utils';
import { useRef } from 'react';

import styles from './landing.module.css';

/**
 * Twinkling star layer behind the hero light. The twinkle pauses while the
 * stars are off screen, so the page stops redrawing them every frame.
 */
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
