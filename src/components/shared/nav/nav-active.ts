import type { NavItem } from '@/features/navigation';

/** Strip a trailing slash except for `/`. skipTrailingSlashRedirect is global. */
export function normalizeNavPathname(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/')
    ? pathname.slice(0, -1)
    : pathname;
}

export function isNavItemActive(pathname: string, item: NavItem): boolean {
  const path = normalizeNavPathname(pathname);
  return item.href === '/'
    ? path === '/'
    : path === item.href || path.startsWith(`${item.href}/`);
}
