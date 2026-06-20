'use client';

import type { ReactNode } from 'react';

import {
  LiquidGlassLayer,
  MARKETING_HEADER_PHYSICS,
  PRICING_HEADER_PHYSICS,
  type LiquidGlassPhysics,
} from '@/components/shared/liquid-glass';
import {
  desktopHeaderShellClass,
  headerGlassSurfaceClass,
  mobileHeaderShellClass,
  type HeaderShellLayout,
  type HeaderShellVariant,
} from '@/components/shared/nav/header-shell';

interface HeaderLiquidGlassShellProps {
  children: ReactNode;
  layout: HeaderShellLayout;
  variant: HeaderShellVariant;
}

type GlassHeaderVariant = Exclude<HeaderShellVariant, 'opaque'>;

const HEADER_VARIANT_PHYSICS: Record<GlassHeaderVariant, LiquidGlassPhysics> = {
  marketing: MARKETING_HEADER_PHYSICS,
  pricing: PRICING_HEADER_PHYSICS,
  protected: MARKETING_HEADER_PHYSICS,
};

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

  if (variant === 'opaque') {
    return <div className={shellClassName}>{children}</div>;
  }

  return (
    <div className={shellClassName}>
      <div className='pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-2xl'>
        <LiquidGlassLayer
          lens={{ width: 0, height: 0, borderRadius: 16 }}
          physics={HEADER_VARIANT_PHYSICS[variant]}
          fallbackClassName={headerGlassSurfaceClass(variant, layout)}
          className='size-full rounded-2xl'
        />
      </div>
      {children}
    </div>
  );
}
