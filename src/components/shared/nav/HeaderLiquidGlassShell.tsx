'use client';

import type { ReactNode } from 'react';

import {
  desktopHeaderShellClass,
  mobileHeaderShellClass,
  type HeaderShellLayout,
  type HeaderShellVariant,
} from '@/components/shared/nav/header-shell';

interface HeaderLiquidGlassShellProps {
  children: ReactNode;
  layout: HeaderShellLayout;
  variant: HeaderShellVariant;
}

/**
 * Header layout shell for the full-bleed bar.
 * Liquid glass lives on the outer {@link SiteHeaderChrome} backdrop, not here.
 */
export default function HeaderLiquidGlassShell({
  children,
  layout,
  variant,
}: HeaderLiquidGlassShellProps) {
  const shellClassName =
    layout === 'desktop'
      ? desktopHeaderShellClass(variant)
      : mobileHeaderShellClass(variant);

  return <div className={shellClassName}>{children}</div>;
}
