/**
 * Compact After Hours header CTAs and nav links (Sora via font-serif).
 * Header-sized cousins of marketing-cta.ts — kept here so shared nav
 * does not import from src/app/(marketing).
 */
export const marketingHeaderPrimaryCtaClassName =
  'group h-auto rounded-full border border-primary/70 bg-primary px-4 py-2 font-serif text-sm font-semibold tracking-[0.01em] text-primary-foreground shadow-sm shadow-primary/20 transition-[border-color,box-shadow,transform,background-color] hover:-translate-y-0.5 hover:border-primary hover:bg-primary/90 hover:shadow-md hover:shadow-primary/30 motion-reduce:transform-none motion-reduce:transition-none';

/**
 * Editorial nav link — quiet Sora text with an animated peach underline
 * that draws in from the left. No pill chrome.
 */
export const marketingHeaderNavLinkClassName =
  'relative inline-flex h-auto shrink-0 items-center whitespace-nowrap bg-transparent px-0.5 py-1.5 font-serif text-sm font-medium tracking-[0.04em] text-muted-foreground transition-colors duration-200 after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:origin-left after:scale-x-0 after:bg-primary after:transition-transform after:duration-300 after:ease-out hover:text-foreground hover:after:scale-x-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none motion-reduce:transition-none motion-reduce:after:transition-none';

/** Active page: full ink and a settled underline. */
export const marketingHeaderNavLinkActiveClassName =
  'text-foreground after:scale-x-100';
