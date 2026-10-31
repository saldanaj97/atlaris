/**
 * Shared CTA styling for marketing hero + final sections.
 * Pill shape + display font (Sora via `--font-serif` → `--font-family-display`).
 */
export const marketingPrimaryCtaClassName =
  'group h-auto rounded-full border border-transparent bg-action-primary px-8 py-4 font-serif font-medium text-action-primary-foreground transition-colors motion-reduce:transition-none hover:bg-action-primary-hover active:bg-action-primary-pressed outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring';

/** Outline secondary pill (pricing / alternate CTAs). */
export const marketingSecondaryCtaClassName =
  'inline-flex items-center justify-center rounded-full border border-panel-border bg-card px-6 py-3 type-label font-serif text-foreground shadow-sm transition-[box-shadow,transform,background-color] motion-reduce:transition-none hover:-translate-y-0.5 hover:bg-card/90 dark:bg-panel dark:hover:bg-panel/90 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring';
