'use client';
import type { NavItem } from '@/features/navigation';

import {
  marketingHeaderNavLinkActiveClassName,
  marketingHeaderNavLinkClassName,
} from '@/components/shared/nav/marketing-header-classes';
import { isNavItemActive } from '@/components/shared/nav/nav-active';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

interface DesktopNavigationProps {
  pathname: string;
  navItems: NavItem[];
  /** Marketing routes use quiet outline pills; app uses text links. */
  appearance?: 'default' | 'marketing';
}

interface DropdownNavItemProps {
  item: NavItem;
  isActive: boolean;
  pathname: string;
  appearance: 'default' | 'marketing';
}

/**
 * Computes the className for a nav item based on active state.
 */
function getNavItemClass(
  isActive: boolean,
  appearance: 'default' | 'marketing',
): string {
  if (appearance === 'marketing') {
    return cn(
      marketingHeaderNavLinkClassName,
      isActive && marketingHeaderNavLinkActiveClassName,
    );
  }

  return cn(
    'inline-flex h-auto shrink-0 items-center gap-1 whitespace-nowrap px-1 py-0 text-sm font-medium transition',
    'hover:text-primary dark:hover:text-primary',
    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none',
    isActive ? 'text-primary dark:text-primary' : 'text-muted-foreground',
  );
}

/**
 * Dropdown navigation item component with accessible button.
 */
function DropdownNavItem({
  item,
  isActive,
  pathname,
  appearance,
}: DropdownNavItemProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          type='button'
          aria-haspopup='menu'
          aria-expanded={isOpen}
          className={cn(
            getNavItemClass(isActive, appearance),
            appearance === 'default' &&
              'hover:bg-transparent dark:hover:bg-transparent',
          )}
        >
          <span>{item.label}</span>
          <ChevronDown className='size-3.5' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='start' className='min-w-40'>
        {item.dropdown?.map((dropdownItem) => {
          const isSubActive = isNavItemActive(pathname, dropdownItem);
          return (
            <DropdownMenuItem key={dropdownItem.href} asChild>
              <Link
                href={dropdownItem.href}
                onClick={() => setIsOpen(false)}
                aria-current={isSubActive ? 'page' : undefined}
                className={cn(
                  isSubActive
                    ? 'font-semibold text-primary'
                    : 'text-muted-foreground',
                )}
              >
                {dropdownItem.label}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Desktop navigation links with dropdown support.
 * Renders horizontal nav items - dropdowns open on click.
 */
export default function DesktopNavigation({
  pathname,
  navItems,
  appearance = 'default',
}: DesktopNavigationProps) {
  const renderNavItem = (item: NavItem) => {
    const isActive = isNavItemActive(pathname, item);

    if (item.dropdown) {
      return (
        <DropdownNavItem
          key={item.href}
          item={item}
          isActive={isActive}
          pathname={pathname}
          appearance={appearance}
        />
      );
    }

    return (
      <Link
        href={item.href}
        className={getNavItemClass(isActive, appearance)}
        key={item.href}
        aria-current={isActive ? 'page' : undefined}
      >
        {item.label}
      </Link>
    );
  };

  return (
    <nav
      className={cn(
        'hidden flex-nowrap items-center md:flex',
        appearance === 'marketing' ? 'gap-6 lg:gap-8' : 'gap-4 lg:gap-6',
      )}
    >
      {navItems.map((item) => renderNavItem(item))}
    </nav>
  );
}
