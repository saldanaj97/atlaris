'use client';

import { useSyncExternalStore } from 'react';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function noopSubscribe(): () => void {
  return () => {};
}

function getPrefersReducedMotionSnapshot(): boolean {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return false;
  }

  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function subscribePrefersReducedMotion(onStoreChange: () => void): () => void {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return noopSubscribe();
  }

  const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
  mediaQuery.addEventListener('change', onStoreChange);
  return () => mediaQuery.removeEventListener('change', onStoreChange);
}

function getSvgFilterSupportSnapshot(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }

  return (
    typeof SVGFEDisplacementMapElement !== 'undefined' &&
    typeof SVGFEImageElement !== 'undefined'
  );
}

/**
 * Client runtime gate for liquid glass: hydration, SVG filter support, and reduced-motion preference.
 */
export function useLiquidGlassRuntime(): {
  isMounted: boolean;
  isSupported: boolean;
  prefersReducedMotion: boolean;
} {
  const isMounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const isSupported = useSyncExternalStore(
    noopSubscribe,
    getSvgFilterSupportSnapshot,
    () => false,
  );

  const prefersReducedMotion = useSyncExternalStore(
    subscribePrefersReducedMotion,
    getPrefersReducedMotionSnapshot,
    () => false,
  );

  return { isMounted, isSupported, prefersReducedMotion };
}
