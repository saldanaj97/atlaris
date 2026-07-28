'use client';

import type { CSSProperties, ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { useLayoutEffect, useRef } from 'react';

import styles from './landing.module.css';

interface RevealAnimationProps {
  children: ReactNode;
  className?: string;
  /** Transition delay in milliseconds, staggers siblings. */
  delay?: number;
}

/**
 * Progressively enhances visible content with a rise-and-fade on scroll.
 * Missing observer support and reduced motion both stay visible.
 */
export function RevealAnimation({
  children,
  className,
  delay = 0,
}: RevealAnimationProps) {
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

  const style: CSSProperties | undefined = delay
    ? { transitionDelay: `${delay}ms` }
    : undefined;

  return (
    <div
      ref={ref}
      style={style}
      className={cn(styles.reveal, className)}
      data-reveal-state='idle'
    >
      {children}
    </div>
  );
}
