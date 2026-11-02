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

/**
 * Crossfades OS light/dark changes while the theme follows the system.
 *
 * next-themes applies the new theme inside its own media-query listener, so a
 * view transition started there would capture the page already switched.
 * Animation frames run after media-query listeners and before paint, so the
 * frame callback puts the previous theme back and replays the change inside a
 * crossfade. Nothing is painted in between.
 */
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
        if (
          !canTransitionTheme() ||
          !document.documentElement.classList.contains(next)
        ) {
          return;
        }
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
