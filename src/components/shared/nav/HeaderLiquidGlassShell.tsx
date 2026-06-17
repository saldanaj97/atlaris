'use client';

import type { ReactNode } from 'react';

import { LiquidGlassLayer } from '@/components/shared/liquid-glass';
import {
  desktopHeaderShellClass,
  headerGlassIntensity,
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
          intensity={headerGlassIntensity(variant)}
          fallbackClassName={headerGlassSurfaceClass(variant, layout)}
          className='size-full rounded-2xl'
        />
      </div>
      {children}
    </div>
  );
}
