'use client';

import type { ReactNode } from 'react';

import {
  LiquidGlassLayer,
  MARKETING_HEADER_PHYSICS,
  PRICING_HEADER_PHYSICS,
} from '@/components/shared/liquid-glass';
import {
  desktopHeaderShellClass,
  headerGlassSurfaceClass,
  mobileHeaderShellClass,
  type HeaderShellLayout,
  type HeaderShellVariant,
  usesLiquidGlassHeader,
} from '@/components/shared/nav/header-shell';

interface HeaderLiquidGlassShellProps {
  children: ReactNode;
  layout: HeaderShellLayout;
  variant: HeaderShellVariant;
}

/**
 * Header layout shell that layers {@link LiquidGlassLayer} behind nav chrome on glass routes.
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

  if (!usesLiquidGlassHeader(variant)) {
    return <div className={shellClassName}>{children}</div>;
  }

  return (
    <div className={shellClassName}>
      <div className='pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-2xl'>
        <LiquidGlassLayer
          lens={{ width: 0, height: 0, borderRadius: 16 }}
          physics={
            variant === 'pricing'
              ? PRICING_HEADER_PHYSICS
              : MARKETING_HEADER_PHYSICS
          }
          fallbackClassName={headerGlassSurfaceClass(variant, layout)}
          className='size-full rounded-2xl'
        />
      </div>
      {children}
    </div>
  );
}
