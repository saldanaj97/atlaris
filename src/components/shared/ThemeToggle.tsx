'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ThemeToggleProps {
  /** Button size variant */
  size?: 'default' | 'sm' | 'lg' | 'icon' | 'icon-sm' | 'icon-lg';
  /** Additional className for styling */
  className?: string;
  /** Wrap in Radix tooltip (use on icon-only instances) */
  withTooltip?: boolean;
}

export function ThemeToggle({
  size = 'icon',
  className,
  withTooltip = false,
}: ThemeToggleProps) {
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

  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  const button = (
    <Button
      variant="ghost"
      size={size}
      onClick={toggleTheme}
      className={className}
      aria-label={label}
    >
      {isDark ? (
        <Sun className="size-5 transition-transform" />
      ) : (
        <Moon className="size-5 transition-transform" />
      )}
    </Button>
  );

  if (!withTooltip) {
    return button;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
