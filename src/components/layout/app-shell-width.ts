export const APP_SHELL_GUTTER = 'px-[clamp(1rem,0.5rem+2vw,2rem)]' as const;

export const APP_SHELL_MAIN_OFFSET =
  'pt-[calc(4rem+env(safe-area-inset-top,0px))]' as const;

export const APP_SHELL_SIDEBAR_OFFSET =
  'lg:pl-[var(--at-app-sidebar-offset,var(--at-semantic-layout-sidebar,14rem))] lg:in-data-[sidebar-motion]:transition-[padding-left] lg:in-data-[sidebar-motion]:duration-(--motion-duration-overlay) lg:in-data-[sidebar-motion]:ease-out motion-reduce:transition-none' as const;

export const APP_SHELL_HEADER_TUCK =
  '-mt-[calc(4rem+env(safe-area-inset-top,0px))]' as const;

export const APP_SHELL_SCROLL_MARGIN =
  'scroll-mt-[calc(4rem+env(safe-area-inset-top,0px)+1.5rem)]' as const;

export const APP_SHELL_COLUMN = 'mx-auto max-w-7xl' as const;
