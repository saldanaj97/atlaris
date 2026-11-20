'use client';

import type { RefObject } from 'react';

import { useEffect } from 'react';

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
