import { cn } from '@/lib/utils';
import * as React from 'react';

/**
 * Paper - A generic component that provides a realistic torn paper aesthetic
 *
 * Features:
 * - Rough, sketchy hand-drawn borders with torn edges
 * - Subtle paper texture overlay
 * - Realistic depth shadows that simulate paper lifting
 * - Heavy hatched shadow for sketch effect
 *
 * Use this component for any element that needs the torn paper look
 * but isn't necessarily a card (e.g., headers, containers, etc.)
 */
type PaperProps = React.ComponentProps<'div'> & {
  /**
   * Deterministic seed for the torn-edge filter selection.
   *
   * If omitted, a stable per-render seed is derived via `useId()` to avoid
   * hydration mismatches while still varying between instances.
   */
  tornSeed?: number | string;
};

export function Paper({ className, tornSeed, ...props }: PaperProps) {
  return (
    <div
      data-slot="paper"
      className={cn('bg-transparent', tornPaperStyles(tornSeed), className)}
      {...props}
    />
  );
}

const tornEdgeFilters = [
  'before:[filter:url(#torn-edge-1)]',
  'before:[filter:url(#torn-edge-7)]',
  'before:[filter:url(#torn-edge-19)]',
  'before:[filter:url(#torn-edge-42)]',
];

const stringToInt = (value: string): number => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
};

const normalizeSeed = (seed?: number | string): number => {
  if (seed === undefined) return 0;
  if (typeof seed === 'number') return seed;
  return stringToInt(seed);
};

/**
 * Shared torn paper surface utility.
 *
 * Encapsulates:
 * - Torn / fibrous border using the `#torn-edge-*` filters
 * - Subtle paper texture via inset shadow
 * - Heavy hatched shadow underneath with the `#sketch` filter
 *
 * Use this for any component that needs the realistic paper treatment on the
 * outer container (cards, headers, generic paper slips, etc.).
 */
export const tornPaperStyles = (seed?: number | string) => {
  const normalizedSeed = normalizeSeed(seed);
  const filterClass =
    tornEdgeFilters[Math.abs(normalizedSeed) % tornEdgeFilters.length];

  return cn(
    'relative z-0',
    // Torn edge with soft gray border for depth (creates natural paper edge look)
    'before:absolute before:inset-0 before:border-t-[1.5px] before:border-l-[1.5px] before:border-r-[1px] before:border-b-[1px] before:border-[rgba(120,110,100,0.25)]',
    'before:rounded-[inherit] before:bg-card-background before:-z-10',
    filterClass,
    // Paper texture + inset shadow on all edges for 3D depth
    'before:shadow-[inset_0_0_80px_rgba(0,0,0,0.05),inset_1px_1px_2px_rgba(100,90,80,0.12),inset_-1px_-1px_2px_rgba(100,90,80,0.12)]',
    // Heavy hatched shadow for depth
    'after:absolute after:top-[12px] after:left-[12px] after:w-full after:h-full after:border-2 after:border-primary after:rounded-base',
    'after:rounded-[inherit] after:bg-[image:var(--pattern-hatch)]',
    'after:[filter:url(#scribble)] after:-z-20'
  );
};
