/**
 * Compact marketing-header CTA and nav links.
 * Header-sized cousins of marketing-cta.ts — kept here so shared nav
 * does not import from src/app/(landing). Inverse fill matches the
 * approved marketing chrome specimen (not a new Button variant).
 */
export const marketingHeaderPrimaryCtaClassName =
  'group inline-flex h-9 min-h-9 items-center rounded-[8px] bg-foreground px-4 py-2 font-sans text-xs font-medium text-background shadow-none transition-[background-color,transform] hover:bg-foreground/90 motion-reduce:transform-none motion-reduce:transition-none [@media(pointer:coarse)]:min-h-11';

/**
 * Quiet text nav with an animated primary underline that draws in from the left.
 */
export const marketingHeaderNavLinkClassName =
  'relative inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap bg-transparent px-0.5 py-1.5 font-sans text-xs font-normal tracking-[0.02em] text-muted-foreground transition-colors duration-200 after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:origin-left after:scale-x-0 after:bg-primary after:transition-transform after:duration-300 after:ease-out hover:text-foreground hover:after:scale-x-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none motion-reduce:transition-none motion-reduce:after:transition-none';

/** Active page: full ink and a settled underline. */
export const marketingHeaderNavLinkActiveClassName =
  'text-foreground after:scale-x-100';
