import { cn } from '@/lib/utils';

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
 *
 * Provide a seed (number or string) to vary the torn edge in a deterministic way.
 */
export const tornPaperSurfaceClasses = (seed?: number | string) => {
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
    'after:absolute after:top-[8px] after:left-[8px] after:w-full after:h-full',
    'after:rounded-[inherit] after:bg-[image:var(--pattern-hatch)]',
    'after:[filter:url(#scribble)] after:-z-20'
  );
};
