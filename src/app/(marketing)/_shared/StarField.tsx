import { cn } from '@/lib/utils';

import styles from './star-field.module.css';

/** Deterministic star chart — no Math.random so SSR and client agree. */
const STARS = [
  { top: '3%', left: '12%', size: 1, delay: 0.3, duration: 5.1 },
  { top: '4%', left: '8%', size: 2, delay: 0, duration: 4.2 },
  { top: '6%', left: '48%', size: 1.5, delay: 2.1, duration: 6.8 },
  { top: '9%', left: '78%', size: 3, delay: 1.4, duration: 5.6 },
  { top: '11%', left: '55%', size: 1, delay: 3.6, duration: 4.5 },
  { top: '14%', left: '32%', size: 2.5, delay: 2.6, duration: 4.8 },
  { top: '16%', left: '94%', size: 1, delay: 1.1, duration: 7.2 },
  { top: '18%', left: '90%', size: 2, delay: 0.8, duration: 6.4 },
  { top: '21%', left: '41%', size: 1.5, delay: 4.2, duration: 5.3 },
  { top: '24%', left: '15%', size: 3.5, delay: 3.4, duration: 5.2 },
  { top: '27%', left: '70%', size: 1, delay: 0.5, duration: 4.9 },
  { top: '29%', left: '62%', size: 2, delay: 1.8, duration: 4.4 },
  { top: '33%', left: '28%', size: 1.5, delay: 2.8, duration: 6.1 },
  { top: '36%', left: '84%', size: 2.5, delay: 0.4, duration: 5.8 },
  { top: '39%', left: '50%', size: 1, delay: 3.9, duration: 5.5 },
  { top: '41%', left: '6%', size: 2, delay: 2.2, duration: 4.6 },
  { top: '44%', left: '96%', size: 1.5, delay: 1.5, duration: 6.7 },
  { top: '47%', left: '44%', size: 3, delay: 3.8, duration: 6.2 },
  { top: '50%', left: '18%', size: 1, delay: 0.7, duration: 4.3 },
  { top: '54%', left: '72%', size: 2.5, delay: 1.2, duration: 4.9 },
  { top: '57%', left: '38%', size: 1.5, delay: 4.4, duration: 5.7 },
  { top: '60%', left: '22%', size: 2, delay: 2.9, duration: 5.4 },
  { top: '63%', left: '58%', size: 1, delay: 1.9, duration: 6.3 },
  { top: '66%', left: '88%', size: 4, delay: 0.6, duration: 4.3 },
  { top: '69%', left: '4%', size: 1.5, delay: 3.2, duration: 5.9 },
  { top: '72%', left: '52%', size: 2, delay: 1.6, duration: 6.1 },
  { top: '75%', left: '80%', size: 1, delay: 2.5, duration: 4.7 },
  { top: '78%', left: '11%', size: 2.5, delay: 3.1, duration: 5.1 },
  { top: '82%', left: '46%', size: 1.5, delay: 0.2, duration: 7.0 },
  { top: '85%', left: '68%', size: 2, delay: 0.9, duration: 4.7 },
  { top: '88%', left: '25%', size: 1, delay: 3.5, duration: 5.8 },
  { top: '91%', left: '35%', size: 3, delay: 2.4, duration: 5.9 },
  { top: '94%', left: '86%', size: 1.5, delay: 1.7, duration: 4.4 },
] as const;

/**
 * Twinkling star field for After Hours marketing surfaces.
 * Stars render in `currentColor`, so set a text color on a parent
 * (e.g. `text-foreground` on parchment, `text-background` on inverted panels).
 */
export function StarField({ className }: { className?: string }) {
  return (
    <div
      className={cn('pointer-events-none absolute inset-0', className)}
      aria-hidden='true'
    >
      {STARS.map((star) => (
        <span
          key={`${star.top}-${star.left}`}
          className={styles.star}
          style={{
            top: star.top,
            left: star.left,
            width: star.size,
            height: star.size,
            ['--star-delay' as string]: `${star.delay}s`,
            ['--star-duration' as string]: `${star.duration}s`,
          }}
        />
      ))}
    </div>
  );
}
