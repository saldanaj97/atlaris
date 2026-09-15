import {
  DESKTOP_SIDEBAR_EXPAND_CONTROL_ID,
  DESKTOP_SIDEBAR_ID,
} from '@/components/shared/nav/desktop-sidebar-state';

/** Must stay aligned with MobileHeader `lg:hidden` / DesktopHeader `lg:grid`. */
export const APP_SHELL_DESKTOP_MEDIA_QUERY = '(min-width: 1024px)';
/** Must stay aligned with MobileHeader `md:hidden` / DesktopHeader `md:grid`. */
export const MARKETING_DESKTOP_MEDIA_QUERY = '(min-width: 768px)';
export const SITE_DESKTOP_NAVIGATION_ID = 'site-desktop-navigation';

const DESKTOP_FOCUSABLE = 'a[href], button:not([disabled])';

export function desktopMediaQuery(isAppShell: boolean): string {
  return isAppShell
    ? APP_SHELL_DESKTOP_MEDIA_QUERY
    : MARKETING_DESKTOP_MEDIA_QUERY;
}

export function focusVisibleDesktopNavigation(isAppShell: boolean): void {
  if (isAppShell) {
    const sidebar = document.getElementById(DESKTOP_SIDEBAR_ID);
    const fromNav = sidebar
      ?.querySelector('nav')
      ?.querySelector<HTMLElement>(DESKTOP_FOCUSABLE);
    if (fromNav) {
      fromNav.focus();
      return;
    }

    const fromSidebar = sidebar?.querySelector<HTMLElement>(DESKTOP_FOCUSABLE);
    if (fromSidebar) {
      fromSidebar.focus();
      return;
    }

    document.getElementById(DESKTOP_SIDEBAR_EXPAND_CONTROL_ID)?.focus();
    return;
  }

  document
    .getElementById(SITE_DESKTOP_NAVIGATION_ID)
    ?.querySelector<HTMLElement>(DESKTOP_FOCUSABLE)
    ?.focus();
}
