'use client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { NavItem } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

interface DesktopNavigationProps {
  navItems: NavItem[];
}

interface DropdownNavItemProps {
  item: NavItem;
  isActive: boolean;
  pathname: string;
}

/**
 * Computes the className for a nav item based on active state.
 */
function getNavItemClass(isActive: boolean): string {
  return cn(
    'flex items-center gap-1 text-sm font-medium transition',
    'hover:text-primary dark:hover:text-primary',
    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none',
    isActive ? 'text-primary dark:text-primary' : 'text-muted-foreground'
  );
}

/**
 * Dropdown navigation item component with accessible button.
 */
function DropdownNavItem({ item, isActive, pathname }: DropdownNavItemProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          className={getNavItemClass(isActive)}
        >
          <span>{item.label}</span>
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-40">
        {item.dropdown?.map((dropdownItem) => (
          <DropdownMenuItem key={dropdownItem.href} asChild>
            <Link
              href={dropdownItem.href}
              className={cn(
                pathname === dropdownItem.href
                  ? 'text-primary font-semibold'
                  : 'text-muted-foreground'
              )}
            >
              {dropdownItem.label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Desktop navigation links with dropdown support.
 * Renders horizontal nav items - dropdowns open on click.
 */
export default function DesktopNavigation({
  navItems,
}: DesktopNavigationProps) {
  const pathname = usePathname();

  const renderNavItem = (item: NavItem) => {
    const isActive =
      item.href === '/'
        ? pathname === '/'
        : pathname === item.href || pathname.startsWith(item.href + '/');

    if (item.dropdown) {
      return (
        <DropdownNavItem
          key={item.href}
          item={item}
          isActive={isActive}
          pathname={pathname}
        />
      );
    }

    // Regular nav item
    return (
      <Link
        key={item.href}
        href={item.href}
        className={getNavItemClass(isActive)}
      >
        {item.label}
      </Link>
    );
  };

  return (
    <nav className="hidden items-center gap-6 md:flex">
      {navItems.map((item) => renderNavItem(item))}
    </nav>
  );
}
