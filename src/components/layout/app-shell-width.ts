/** Horizontal gutters outside the max-width column (SiteHeader + PageShell). */
export const APP_SHELL_GUTTER = 'px-[16px] md:px-[24px] xl:px-[32px]' as const;

/** Header-aware main offset, including notch safe area. */
export const APP_SHELL_MAIN_OFFSET =
  'pt-[calc(4rem+env(safe-area-inset-top,0px))]' as const;

/** Authenticated app rail offset, matching the 224px desktop sidebar. */
export const APP_SHELL_SIDEBAR_OFFSET = 'lg:pl-56' as const;

/** Landing-only: cancels in-flow offset so a canvas can paint behind the fixed header. */
export const APP_SHELL_HEADER_TUCK =
  '-mt-[calc(4rem+env(safe-area-inset-top,0px))]' as const;

/** Centered product app content column (SiteHeader inner wrapper + PageShell). */
export const APP_SHELL_COLUMN = 'mx-auto max-w-7xl' as const;
