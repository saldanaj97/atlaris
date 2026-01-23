'use client';
import { Button } from '@/components/ui/button';
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

/**
 * Computes the className for navigation button based on active state.
 */
function getNavButtonClass(isActive: boolean): string {
  return cn(
    'flex items-center space-x-1 text-sm font-medium transition',
    'hover:text-primary dark:hover:text-primary',
    'focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none',
    isActive ? 'text-primary dark:text-primary' : 'text-muted-foreground'
  );
}

interface DropdownNavItemProps {
  item: NavItem;
  isActive: boolean;
  pathname: string;
}

/**
 * Dropdown navigation item component with accessible button.
 */
function DropdownNavItem({ item, isActive, pathname }: DropdownNavItemProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          className={getNavButtonClass(isActive)}
        >
          <span>{item.label}</span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="min-w-[160px] rounded-xl border border-white/40 bg-white/80 shadow-lg backdrop-blur-md"
      >
        {item.dropdown?.map((dropdownItem) => (
          <DropdownMenuItem key={dropdownItem.href} asChild>
            <Link
              href={dropdownItem.href}
              className={cn(
                'cursor-pointer px-4 py-2 text-sm transition-colors',
                'hover:bg-primary/10 hover:text-primary',
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
    const isActive = pathname === item.href;

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
        className={cn(
          'text-sm font-medium transition',
          'hover:text-primary dark:hover:text-primary',
          isActive ? 'text-primary dark:text-primary' : 'text-muted-foreground'
        )}
      >
        {item.label}
      </Link>
    );
  };

  return (
    <nav className="hidden items-center space-x-8 md:flex">
      {navItems.map((item) => renderNavItem(item))}
    </nav>
  );
}
