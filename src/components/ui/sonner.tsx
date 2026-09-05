'use client';

import type { CSSProperties } from 'react';

import { useTheme } from 'next-themes';
import { Toaster as Sonner } from 'sonner';

const toasterStyle = {
  '--width': 'min(24rem, calc(100vw - 2rem))',
  zIndex: 60,
} as CSSProperties;

export function Toaster() {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      closeButton
      mobileOffset={{
        bottom: 'max(1rem, env(safe-area-inset-bottom))',
        left: 'max(1rem, env(safe-area-inset-left))',
        right: 'max(1rem, env(safe-area-inset-right))',
        top: 'max(1rem, env(safe-area-inset-top))',
      }}
      offset={{
        bottom: 'max(1rem, env(safe-area-inset-bottom))',
        left: 'max(1rem, env(safe-area-inset-left))',
        right: 'max(1rem, env(safe-area-inset-right))',
        top: 'max(1rem, env(safe-area-inset-top))',
      }}
      position='bottom-right'
      richColors
      style={toasterStyle}
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      toastOptions={{
        closeButtonAriaLabel: 'Dismiss notification',
        unstyled: true,
        classNames: {
          actionButton:
            'min-h-[44px] rounded-md bg-action-primary px-3 font-medium text-action-primary-foreground transition-colors hover:bg-action-primary-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none',
          cancelButton:
            'min-h-[44px] rounded-md border border-input bg-card px-3 text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none',
          closeButton:
            'absolute top-1/2 right-3 flex size-[44px] -translate-y-1/2 items-center justify-center rounded-md border border-input bg-popover text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none',
          description: 'text-sm text-muted-foreground',
          error: 'border-danger bg-danger-subtle text-danger',
          info: 'border-input bg-popover text-popover-foreground',
          success: 'border-success bg-success/10 text-success',
          title: 'font-medium text-foreground',
          toast:
            'relative w-full items-start gap-3 rounded-xl border border-input bg-popover p-4 pr-14 text-sm text-popover-foreground shadow-[0_16px_48px_0_rgb(0_0_0_/_0.48)]',
          warning: 'border-warning bg-warning/10 text-warning',
        },
      }}
    />
  );
}
