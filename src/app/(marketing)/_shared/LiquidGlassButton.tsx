'use client';

import type { ComponentProps } from 'react';

import { marketingPrimaryCtaClassName } from '@/app/(marketing)/_shared/marketing-cta';
import {
  LiquidGlass,
  MARKETING_CTA_PHYSICS,
} from '@/components/shared/liquid-glass';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Matches `rounded-lg` on marketing primary CTAs. */
const CTA_LENS_BORDER_RADIUS = 8;

/** Static glass fallback when displacement filters are unavailable. */
const CTA_FALLBACK_CLASS_NAME =
  'inline-flex rounded-lg border border-white/30 bg-primary/90 shadow-lg backdrop-blur-md dark:border-white/10';

/** Semi-transparent surface so the liquid-glass layer remains visible through the CTA. */
const LIQUID_GLASS_CTA_SURFACE_CLASS_NAME =
  'border border-white/25 bg-primary/70 shadow-primary/20 hover:bg-primary/80 dark:border-white/10';

type LiquidGlassButtonProps = ComponentProps<typeof Button>;

/**
 * Marketing-only primary CTA with liquid-glass refraction.
 * Wraps `Button` outside the interactive child so `asChild` + `Link` stay valid.
 */
export function LiquidGlassButton({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: LiquidGlassButtonProps) {
  return (
    <LiquidGlass
      lens={{ width: 0, height: 0, borderRadius: CTA_LENS_BORDER_RADIUS }}
      physics={MARKETING_CTA_PHYSICS}
      fallbackClassName={CTA_FALLBACK_CLASS_NAME}
      className='inline-flex'
    >
      <Button
        asChild={asChild}
        variant={variant}
        size={size}
        className={cn(
          marketingPrimaryCtaClassName,
          LIQUID_GLASS_CTA_SURFACE_CLASS_NAME,
          className,
        )}
        {...props}
      />
    </LiquidGlass>
  );
}
