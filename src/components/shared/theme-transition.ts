export type ResolvedTheme = 'light' | 'dark';

export const THEME_ATTRIBUTES: ['class', 'data-atlaris-theme'] = [
  'class',
  'data-atlaris-theme',
];

/**
 * True when a theme change can crossfade: the browser supports the View
 * Transitions API and the user has not asked for reduced motion.
 */
export function canTransitionTheme(): boolean {
  return (
    typeof document.startViewTransition === 'function' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function transitionTheme(applyTheme: () => void): void {
  if (!canTransitionTheme()) {
    applyTheme();
    return;
  }
  document.startViewTransition(applyTheme);
}

export function applyResolvedTheme(theme: ResolvedTheme): void {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(theme);
  root.setAttribute(THEME_ATTRIBUTES[1], theme);
  root.style.colorScheme = theme;
}
