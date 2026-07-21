/**
 * Shared CTA styling for marketing hero + final sections.
 * Pill shape + display font (Sora via `--font-serif` → `--font-family-display`).
 * Solid/outline pills only — no liquid-glass wrapper (clips dirty on rounded-full).
 */
export const marketingPrimaryCtaClassName =
  'group h-auto rounded-full bg-primary px-8 py-4 font-serif font-medium text-primary-foreground shadow-lg shadow-primary/25 transition-[box-shadow,transform,background-color] motion-reduce:transition-none hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/30';

/** Outline secondary pill (pricing / alternate CTAs). */
export const marketingSecondaryCtaClassName =
  'inline-flex items-center justify-center rounded-full border border-panel-border bg-card px-6 py-3 font-serif text-sm font-medium text-foreground shadow-sm transition-[box-shadow,transform,background-color] motion-reduce:transition-none hover:-translate-y-0.5 hover:bg-card/90 dark:bg-panel dark:hover:bg-panel/90';
