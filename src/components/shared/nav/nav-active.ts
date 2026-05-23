import type { NavItem } from '@/features/navigation';

export function isNavItemActive(pathname: string, item: NavItem): boolean {
  return item.href === '/'
    ? pathname === '/'
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
