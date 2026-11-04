import { cn } from '@/lib/utils';

import styles from './horizon-arc.module.css';

/** Decorative horizon line for page heroes and CTA banners; drawn in CSS, hidden from assistive tech. */
export function HorizonArc({ className }: { className?: string }) {
  return (
    // oxlint-disable-next-line shadcn/require-static-classes -- imported CSS module class is complete but opaque to the rule
    <div
      aria-hidden='true'
      data-slot='horizon-arc'
      className={cn(styles.root, className)}
    />
  );
}
