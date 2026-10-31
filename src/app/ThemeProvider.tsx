'use client';

import type { ReactNode } from 'react';

import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

interface ThemeProviderProps {
  children: ReactNode;
  /** Per-request CSP nonce for next-themes' inline anti-flash script. */
  nonce?: string;
}

/**
 * Theme provider component that wraps next-themes.
 *
 * Configuration:
 * - attribute=["class", "data-atlaris-theme"]: Keeps Tailwind's .dark
 *   selector and scopes the Midnight tokens to the same root element
 * - defaultTheme="system": Respects user's OS preference by default
 * - enableSystem: Allows automatic theme detection
 * - disableTransitionOnChange: Prevents flash during theme switch
 * - nonce: Lets the inline theme script run under the nonce-based CSP
 */
export function ThemeProvider({ children, nonce }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute={['class', 'data-atlaris-theme']}
      defaultTheme='system'
      enableSystem
      disableTransitionOnChange
      nonce={nonce}
    >
      <TooltipProvider>{children}</TooltipProvider>
    </NextThemesProvider>
  );
}
