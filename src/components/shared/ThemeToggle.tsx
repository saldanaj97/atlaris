'use client';

import { transitionTheme } from '@/components/shared/theme-transition';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';
// react-doctor-disable-next-line react-doctor/no-flush-sync -- flushSync inside the startViewTransition callback is required so the crossfade captures the new theme.
import { flushSync } from 'react-dom';

interface ThemeToggleProps {
  size?: 'default' | 'sm' | 'lg' | 'icon' | 'icon-sm' | 'icon-lg';
  className?: string;
  withTooltip?: boolean;
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
}

function subscribeMounted(onStoreChange: () => void): () => void {
  onStoreChange();
  return () => {};
}

function getMountedSnapshot(): boolean {
  return true;
}

function getServerMountedSnapshot(): boolean {
  return false;
}

export function ThemeToggle({
  size = 'icon',
  className,
  withTooltip = false,
  tooltipSide = 'bottom',
}: ThemeToggleProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribeMounted,
    getMountedSnapshot,
    getServerMountedSnapshot,
  );

  const toggleTheme = () => {
    const currentTheme = resolvedTheme ?? theme;
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    // flushSync commits the change (next-themes writes the root in an effect)
    // before the view transition captures the new page.
    transitionTheme(() => flushSync(() => setTheme(nextTheme)));
  };

  if (!mounted) {
    return (
      <Button
        variant='ghost'
        size={size}
        className={className}
        disabled
        aria-label='Toggle theme'
      >
        <Sun aria-hidden='true' className='size-5' />
      </Button>
    );
  }

  const isDark = resolvedTheme === 'dark';

  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  const button = (
    <Button
      variant='ghost'
      size={size}
      onClick={toggleTheme}
      className={className}
      aria-label={label}
    >
      {isDark ? (
        <Sun aria-hidden='true' className='size-5 transition-transform' />
      ) : (
        <Moon aria-hidden='true' className='size-5 transition-transform' />
      )}
    </Button>
  );

  if (!withTooltip) {
    return button;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side={tooltipSide}>{label}</TooltipContent>
    </Tooltip>
  );
}
