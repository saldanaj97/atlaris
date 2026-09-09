'use client';

import type { ReactNode } from 'react';

import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

interface ThemeProviderProps {
  children: ReactNode;
}

/**
 * Theme provider component that wraps next-themes.
 *
 * Configuration:
 * - attribute=["class", "data-atlaris-theme"]: Keeps Tailwind's .dark
 *   selector and scopes generated tokens to the same root element
 * - defaultTheme="system": Respects user's OS preference by default
 * - enableSystem: Allows automatic theme detection
 * - disableTransitionOnChange: Prevents flash during theme switch
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute={['class', 'data-atlaris-theme']}
      defaultTheme='system'
      enableSystem
      disableTransitionOnChange
    >
      <TooltipProvider>{children}</TooltipProvider>
    </NextThemesProvider>
  );
}
