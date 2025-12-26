'use client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { NavItem } from '@/lib/navigation';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface DesktopNavigationProps {
  navItems: NavItem[];
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
        <DropdownMenu key={item.href}>
          <DropdownMenuTrigger asChild>
            <button
              className={`flex items-center space-x-1 text-sm font-medium transition hover:text-purple-600 focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:outline-none ${
                isActive ? 'text-purple-600' : 'text-gray-600'
              }`}
            >
              <span>{item.label}</span>
              <ChevronDown className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="min-w-[160px] rounded-xl border border-white/40 bg-white/80 shadow-lg backdrop-blur-md"
          >
            {item.dropdown.map((dropdownItem) => (
              <DropdownMenuItem key={dropdownItem.href} asChild>
                <Link
                  href={dropdownItem.href}
                  className={`cursor-pointer px-4 py-2 text-sm transition-colors hover:bg-purple-50 hover:text-purple-600 ${
                    pathname === dropdownItem.href
                      ? 'font-semibold text-purple-600'
                      : 'text-gray-600'
                  }`}
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
      <Link
        key={item.href}
        href={item.href}
        className={`text-sm font-medium transition hover:text-purple-600 ${
          isActive ? 'text-purple-600' : 'text-gray-600'
        }`}
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
