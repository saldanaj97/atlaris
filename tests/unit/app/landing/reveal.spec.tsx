import { RevealAnimation } from '@/app/(marketing)/landing/components/RevealAnimation';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app/(marketing)/landing/components/landing.module.css', () => ({
  default: { reveal: 'reveal' },
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RevealAnimation', () => {
  it('keeps content visible when IntersectionObserver is unavailable', () => {
    vi.stubGlobal('IntersectionObserver', undefined);

    render(<RevealAnimation>Always visible</RevealAnimation>);

    expect(screen.getByText('Always visible')).toHaveAttribute(
      'data-reveal-state',
      'idle',
    );
  });

  it('enhances content with reveal states when observation is available', () => {
    let callback: IntersectionObserverCallback | undefined;
    const disconnect = vi.fn();
    const observe = vi.fn();

    class TestIntersectionObserver {
      constructor(nextCallback: IntersectionObserverCallback) {
        callback = nextCallback;
      }

      observe = observe;
      disconnect = disconnect;
    }

    vi.stubGlobal('IntersectionObserver', TestIntersectionObserver);
    render(<RevealAnimation>Animated content</RevealAnimation>);

    const element = screen.getByText('Animated content');
    expect(element).toHaveAttribute('data-reveal-state', 'observing');
    expect(observe).toHaveBeenCalledWith(element);

    act(() => {
      callback?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    expect(element).toHaveAttribute('data-reveal-state', 'visible');
    expect(disconnect).toHaveBeenCalled();
  });
});
