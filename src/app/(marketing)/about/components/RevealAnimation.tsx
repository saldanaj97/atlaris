'use client';

import type { ReactNode } from 'react';

import { useLayoutEffect, useRef } from 'react';

import styles from './about.module.css';

interface RevealAnimationProps {
  children: ReactNode;
}

/**
 * Progressively enhances visible content with a rise-and-fade on scroll.
 * Missing observer support and reduced motion both stay visible.
 */
export function RevealAnimation({ children }: RevealAnimationProps) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          node.dataset.revealState = 'visible';
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.15 },
    );

    node.dataset.revealState = 'observing';
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={styles.reveal} data-reveal-state='idle'>
      {children}
    </div>
  );
}
