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
  it('pauses each star only while it is off screen', () => {
    const { observe, report } = stubObserver();
    const { container } = render(<CelestialBackdrop variant='dusk' />);

    // The orbs are static, so only the stars are observed.
    const animated = container.querySelectorAll('[data-offscreen-pause]');
    expect(animated.length).toBeGreaterThan(0);
    expect(observe).toHaveBeenCalledTimes(animated.length);
    expect(
      container.firstElementChild?.querySelectorAll(
        ':scope > [data-offscreen-pause]',
      ),
    ).toHaveLength(0);

    const [star] = animated;
    report(star, false);
    expect(star).toHaveAttribute('data-paused', 'true');

    report(star, true);
    expect(star).toHaveAttribute('data-paused', 'false');
  });

  it('stops observing on unmount', () => {
    const { disconnect } = stubObserver();
    const { unmount } = render(<CelestialBackdrop variant='dusk' />);

    unmount();
    expect(disconnect).toHaveBeenCalled();
  });

  it('leaves animations running when IntersectionObserver is unavailable', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { container } = render(<CelestialBackdrop variant='dusk' />);

    expect(container.querySelector('[data-paused]')).toBeNull();
  });
});
