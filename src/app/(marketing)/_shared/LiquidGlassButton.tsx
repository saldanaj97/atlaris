import type { ComponentProps } from 'react';

import { marketingPrimaryCtaClassName } from '@/app/(marketing)/_shared/marketing-cta';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type LiquidGlassButtonProps = ComponentProps<typeof Button>;

/**
 * Marketing primary CTA pill (solid peach).
 * Name is historical — liquid-glass was dropped because the wrapper’s
 * rectangular overflow/isolate shell clipped outside `rounded-full`.
 */
export function LiquidGlassButton({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: LiquidGlassButtonProps) {
  return (
    <Button
      asChild={asChild}
      variant={variant}
      size={size}
      className={cn(marketingPrimaryCtaClassName, className)}
      {...props}
    />
  );
}
