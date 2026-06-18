import { useLiquidGlassRuntime } from '@/components/shared/liquid-glass/use-liquid-glass-runtime';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

function createMatchMediaMock(matches: boolean) {
  const listeners = new Set<() => void>();

  return vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: (_event: string, listener: () => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_event: string, listener: () => void) => {
      listeners.delete(listener);
    },
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    emitChange(nextMatches: boolean) {
      matches = nextMatches;
      for (const listener of listeners) {
        listener();
      }
    },
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useLiquidGlassRuntime', () => {
  it('reports reduced motion when the media query matches', () => {
    vi.stubGlobal('matchMedia', createMatchMediaMock(true));

    const { result } = renderHook(() => useLiquidGlassRuntime());

    expect(result.current.isMounted).toBe(true);
    expect(result.current.prefersReducedMotion).toBe(true);
  });

  it('updates when the reduced-motion preference changes', () => {
    const matchMedia = createMatchMediaMock(false);
    vi.stubGlobal('matchMedia', matchMedia);

    const { result } = renderHook(() => useLiquidGlassRuntime());
    const mediaQuery = matchMedia.mock.results[0]?.value as {
      emitChange: (nextMatches: boolean) => void;
    };

    act(() => {
      mediaQuery.emitChange(true);
    });

    expect(result.current.prefersReducedMotion).toBe(true);
  });

  it('treats missing matchMedia as no reduced-motion preference', () => {
    vi.stubGlobal('matchMedia', undefined);

    const { result } = renderHook(() => useLiquidGlassRuntime());

    expect(result.current.prefersReducedMotion).toBe(false);
  });

  it('detects SVG displacement filter support in the browser', () => {
    vi.stubGlobal('matchMedia', createMatchMediaMock(false));

    const { result } = renderHook(() => useLiquidGlassRuntime());

    expect(result.current.isSupported).toBe(
      typeof SVGFEDisplacementMapElement !== 'undefined' &&
        typeof SVGFEImageElement !== 'undefined',
    );
  });
});
