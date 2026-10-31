import { CelestialBackdrop } from '@/app/(landing)/_shared/CelestialBackdrop';
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubObserver() {
  let callback: IntersectionObserverCallback | undefined;
  const observe = vi.fn();
  const disconnect = vi.fn();

  class TestIntersectionObserver {
    constructor(nextCallback: IntersectionObserverCallback) {
      callback = nextCallback;
    }

    observe = observe;
    disconnect = disconnect;
  }

  vi.stubGlobal('IntersectionObserver', TestIntersectionObserver);
  const report = (target: Element, isIntersecting: boolean) =>
    act(() => {
      callback?.(
        [{ target, isIntersecting } as unknown as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

  return { observe, disconnect, report };
}

describe('CelestialBackdrop off-screen pause', () => {
  it('pauses each orb and star only while it is off screen', () => {
    const { observe, report } = stubObserver();
    const { container } = render(<CelestialBackdrop variant='landing' />);

    const animated = container.querySelectorAll('[data-offscreen-pause]');
    expect(animated.length).toBeGreaterThan(2);
    expect(observe).toHaveBeenCalledTimes(animated.length);

    const [orb] = animated;
    report(orb, false);
    expect(orb).toHaveAttribute('data-paused', 'true');

    report(orb, true);
    expect(orb).toHaveAttribute('data-paused', 'false');
  });

  it('stops observing on unmount', () => {
    const { disconnect } = stubObserver();
    const { unmount } = render(<CelestialBackdrop variant='dusk' />);

    unmount();
    expect(disconnect).toHaveBeenCalled();
  });

  it('leaves animations running when IntersectionObserver is unavailable', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { container } = render(<CelestialBackdrop variant='landing' />);

    expect(container.querySelector('[data-paused]')).toBeNull();
  });
});
