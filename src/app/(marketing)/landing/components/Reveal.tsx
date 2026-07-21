'use client';

import type { CSSProperties, ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { useEffect, useRef, useState } from 'react';

import styles from './landing.module.css';

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Transition delay in milliseconds, staggers siblings. */
  delay?: number;
}

/**
 * Reveals children with a rise-and-fade when scrolled into view.
 * Falls back to always-visible under reduced motion (handled in CSS).
 */
export function Reveal({ children, className, delay = 0 }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.15 },
    );

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
      className={cn(styles.reveal, visible && styles.revealVisible, className)}
    >
      {children}
    </div>
  );
}
