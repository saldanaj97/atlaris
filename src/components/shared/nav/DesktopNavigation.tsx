'use client';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { NavItem } from '@/lib/navigation';

interface DesktopNavigationProps {
  navItems: NavItem[];
}

export default function DesktopNavigation({
  navItems,
}: DesktopNavigationProps) {
  const renderNavItem = (item: NavItem) => {
    if (item.dropdown) {
      return (
        <DropdownMenu key={item.href}>
          <DropdownMenuTrigger asChild>
            <Button variant="nav-button" className="gap-1">
              <span className="text-sm sm:text-base">{item.label}</span>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[160px]">
            {item.dropdown.map((dropdownItem) => (
              <DropdownMenuItem key={dropdownItem.href} asChild>
                <Link
                  href={dropdownItem.href}
                  className={
                    dropdownItem.highlight ? 'text-main font-medium' : undefined
                  }
                >
                  {dropdownItem.label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }

    // Regular nav item
    return (
      <Button
        asChild
        key={item.href}
        variant="nav-button"
        className={item.highlight ? 'bg-main text-main-foreground' : undefined}
      >
        <Link href={item.href} className="text-sm sm:text-base">
          {item.label}
        </Link>
      </Button>
    );
  };

  return (
    <nav className="flex items-center">
      <div className="flex items-center gap-2">
        {navItems.map((item) => renderNavItem(item))}
      </div>
    </nav>
  );
}
