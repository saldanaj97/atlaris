'use client';

import type { RefObject } from 'react';

import { useEffect } from 'react';

/**
 * Pauses decorative CSS animations while they are off screen, so the page
 * stops redrawing what nobody can see. Watches the element at `ref` when it
 * carries `data-offscreen-pause`, otherwise each descendant that does, and
 * sets `data-paused` on each; the element's stylesheet maps that to
 * `animation-play-state: paused`. Without observer support nothing pauses.
 */
export function useOffscreenPause(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = ref.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;

    const targets = root.matches('[data-offscreen-pause]')
      ? [root]
      : Array.from(
          root.querySelectorAll<HTMLElement>('[data-offscreen-pause]'),
        );

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target instanceof HTMLElement) {
          entry.target.dataset.paused = String(!entry.isIntersecting);
        }
      }
    });

    for (const target of targets) observer.observe(target);
    return () => observer.disconnect();
  }, [ref]);
}
