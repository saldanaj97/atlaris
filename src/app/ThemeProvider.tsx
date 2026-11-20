'use client';

import {
  applyResolvedTheme,
  canTransitionTheme,
  THEME_ATTRIBUTES,
  transitionTheme,
} from '@/components/shared/theme-transition';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider as NextThemesProvider, useTheme } from 'next-themes';
import { useEffect, type ReactNode } from 'react';

interface ThemeProviderProps {
  children: ReactNode;
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
 * - disableTransitionOnChange: Prevents flash during theme switch; the
 *   crossfade comes from a root view transition instead (ThemeToggle and
 *   SystemThemeCrossfade)
 * - nonce: Lets the inline theme script run under the nonce-based CSP
 */
export function ThemeProvider({ children, nonce }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute={THEME_ATTRIBUTES}
      defaultTheme='system'
      enableSystem
      disableTransitionOnChange
      nonce={nonce}
    >
      <SystemThemeCrossfade />
      <TooltipProvider>{children}</TooltipProvider>
    </NextThemesProvider>
  );
}

function SystemThemeCrossfade() {
  const { theme } = useTheme();

  useEffect(() => {
    if (theme !== 'system') return;

    const query = window.matchMedia('(prefers-color-scheme: dark)');
    let frame = 0;
    const onChange = (event: MediaQueryListEvent) => {
      const next = event.matches ? 'dark' : 'light';
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!canTransitionTheme()) return;
        applyResolvedTheme(next === 'dark' ? 'light' : 'dark');
        transitionTheme(() => applyResolvedTheme(next));
      });
    };

    query.addEventListener('change', onChange);
    return () => {
      query.removeEventListener('change', onChange);
      cancelAnimationFrame(frame);
    };
  }, [theme]);

  return null;
}
