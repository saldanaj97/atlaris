/** Horizontal gutters outside the max-width column (SiteHeader + PageShell). */
export const APP_SHELL_GUTTER = 'px-4 lg:px-6' as const;

/** Header-aware main offset, including notch safe area. */
export const APP_SHELL_MAIN_OFFSET =
  'pt-[calc(4rem+env(safe-area-inset-top,0px))]' as const;

/** Cancels `APP_SHELL_MAIN_OFFSET` so a canvas can paint behind the fixed header. */
export const APP_SHELL_HEADER_TUCK =
  '-mt-[calc(4rem+env(safe-area-inset-top,0px))]' as const;

/** Centered product app content column (SiteHeader inner wrapper + PageShell). */
export const APP_SHELL_COLUMN = 'mx-auto max-w-7xl' as const;

/** Inner product content rail, matching the header chrome content inset. */
export const APP_SHELL_CONTENT_INSET = 'px-3 sm:px-4 md:px-5' as const;
