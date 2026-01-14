'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ReactNode } from 'react';

interface ThemeProviderProps {
  children: ReactNode;
}

/**
 * Theme provider component that wraps next-themes.
 *
 * Configuration:
 * - attribute="class": Uses class-based dark mode (adds .dark to html)
 * - defaultTheme="system": Respects user's OS preference by default
 * - enableSystem: Allows automatic theme detection
 * - disableTransitionOnChange: Prevents flash during theme switch
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
