'use client';

import { Button } from '@/components/ui/button';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

interface ThemeToggleProps {
  /** Button size variant */
  size?: 'default' | 'sm' | 'lg' | 'icon' | 'icon-sm' | 'icon-lg';
  /** Additional className for styling */
  className?: string;
}

/**
 * Theme toggle button that switches between light and dark modes.
 *
 * - Shows sun icon in dark mode (click to switch to light)
 * - Shows moon icon in light mode (click to switch to dark)
 * - Handles hydration mismatch by mounting check
 */
export function ThemeToggle({ size = 'icon', className }: ThemeToggleProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch by only rendering after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    // Use resolvedTheme to handle 'system' theme correctly
    const currentTheme = resolvedTheme ?? theme;
    setTheme(currentTheme === 'dark' ? 'light' : 'dark');
  };

  // Render placeholder during SSR to prevent layout shift
  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size={size}
        className={className}
        disabled
        aria-label="Toggle theme"
      >
        <Sun className="size-5" />
      </Button>
    );
  }

  const isDark = resolvedTheme === 'dark';

  return (
    <Button
      variant="ghost"
      size={size}
      onClick={toggleTheme}
      className={className}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? (
        <Sun className="size-5 transition-transform" />
      ) : (
        <Moon className="size-5 transition-transform" />
      )}
    </Button>
  );
}
