import type { NavItem } from '@/features/navigation';

import { stripTrailingSlash } from '@/lib/path/strip-trailing-slash';

export const normalizeNavPathname = stripTrailingSlash;

export function isNavItemActive(pathname: string, item: NavItem): boolean {
  const path = normalizeNavPathname(pathname);
  return item.href === '/'
    ? path === '/'
    : path === item.href || path.startsWith(`${item.href}/`);
}
