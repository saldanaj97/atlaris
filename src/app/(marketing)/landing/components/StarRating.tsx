/**
 * Reusable star rating display component.
 * Renders a row of filled star icons for visual rating representation.
 */

/** Stable keys for repeated decorative stars (avoids index-as-key; max display cap). */
const RATING_STAR_KEYS = [
  'rating-star-1',
  'rating-star-2',
  'rating-star-3',
  'rating-star-4',
  'rating-star-5',
  'rating-star-6',
  'rating-star-7',
  'rating-star-8',
  'rating-star-9',
  'rating-star-10',
] as const;

interface StarRatingProps {
  /** Number of stars to display (default: 5) */
  count?: number;
}

export function StarRating({ count = 5 }: StarRatingProps) {
  const n = Math.min(Math.max(0, count), RATING_STAR_KEYS.length);
  const keys = RATING_STAR_KEYS.slice(0, n);

  return (
    <div className="flex" aria-hidden="true">
      {keys.map((starKey) => (
        <svg
          key={starKey}
          className="h-5 w-5 text-amber-400"
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden="true"
          focusable="false"
        >
          <title>Star</title>
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}
