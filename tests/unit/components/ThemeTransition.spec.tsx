import { ThemeProvider } from '@/app/ThemeProvider';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type MediaListener = (event: MediaQueryListEvent) => void;

const media = { dark: false, reducedMotion: false };
const colorSchemeListeners = new Set<MediaListener>();
let frames: FrameRequestCallback[] = [];
let transitions: Array<() => void> = [];

function fakeMediaQueryList(query: string): MediaQueryList {
  const isColorScheme = query.includes('prefers-color-scheme');
  const add = (listener: MediaListener) => {
    if (isColorScheme) colorSchemeListeners.add(listener);
  };
  const remove = (listener: MediaListener) => {
    colorSchemeListeners.delete(listener);
  };
  return {
    get matches() {
      return isColorScheme ? media.dark : media.reducedMotion;
    },
    media: query,
    onchange: null,
    addListener: add,
    removeListener: remove,
    addEventListener: (_type: string, listener: MediaListener) => add(listener),
    removeEventListener: (_type: string, listener: MediaListener) =>
      remove(listener),
    dispatchEvent: () => true,
  } as unknown as MediaQueryList;
}

/** Fires every color-scheme listener, as the browser does on an OS change. */
function setOsDark(dark: boolean) {
  media.dark = dark;
  for (const listener of [...colorSchemeListeners]) {
    listener({ matches: dark } as MediaQueryListEvent);
  }
}

function rootTheme() {
  const root = document.documentElement;
  return {
    className: root.classList.contains('dark') ? 'dark' : 'light',
    attribute: root.getAttribute('data-atlaris-theme'),
  };
}

function renderToggle() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

describe('theme crossfade', () => {
  beforeEach(() => {
    media.dark = false;
    media.reducedMotion = false;
    colorSchemeListeners.clear();
    frames = [];
    transitions = [];
    localStorage.clear();
    vi.stubGlobal('matchMedia', vi.fn(fakeMediaQueryList));
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      frames.push(callback),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    document.startViewTransition = vi.fn((callback: () => void) => {
      transitions.push(callback);
      return {} as ViewTransition;
    }) as unknown as typeof document.startViewTransition;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(document, 'startViewTransition');
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-atlaris-theme');
  });

  it('switches the page inside the view transition when toggled', () => {
    renderToggle();
    expect(rootTheme()).toEqual({ className: 'light', attribute: 'light' });

    fireEvent.click(
      screen.getByRole('button', { name: 'Switch to dark mode' }),
    );

    // The old page is still shown when the transition captures it.
    expect(document.startViewTransition).toHaveBeenCalledTimes(1);
    expect(rootTheme()).toEqual({ className: 'light', attribute: 'light' });

    // The new page must be committed by the time the callback returns, or the
    // transition captures the old theme twice and the switch still snaps.
    let afterCallback: ReturnType<typeof rootTheme> | undefined;
    act(() => {
      transitions[0]?.();
      afterCallback = rootTheme();
    });
    expect(afterCallback).toEqual({ className: 'dark', attribute: 'dark' });
  });

  it('switches instantly under reduced motion', () => {
    media.reducedMotion = true;
    renderToggle();

    fireEvent.click(
      screen.getByRole('button', { name: 'Switch to dark mode' }),
    );

    expect(document.startViewTransition).not.toHaveBeenCalled();
    expect(rootTheme()).toEqual({ className: 'dark', attribute: 'dark' });
  });

  it('switches instantly without view transition support', () => {
    Reflect.deleteProperty(document, 'startViewTransition');
    renderToggle();

    fireEvent.click(
      screen.getByRole('button', { name: 'Switch to dark mode' }),
    );

    expect(rootTheme()).toEqual({ className: 'dark', attribute: 'dark' });
  });

  it('crossfades an OS theme change while following the system theme', () => {
    renderToggle();
    expect(rootTheme()).toEqual({ className: 'light', attribute: 'light' });

    act(() => setOsDark(true));
    act(() => {
      for (const frame of frames.splice(0)) frame(0);
    });

    // The previous theme is back on screen for the transition to capture.
    expect(document.startViewTransition).toHaveBeenCalledTimes(1);
    expect(rootTheme()).toEqual({ className: 'light', attribute: 'light' });

    act(() => transitions[0]?.());
    expect(rootTheme()).toEqual({ className: 'dark', attribute: 'dark' });
  });

  it('leaves an explicitly chosen theme alone when the OS theme changes', () => {
    localStorage.setItem('theme', 'light');
    renderToggle();

    act(() => setOsDark(true));
    act(() => {
      for (const frame of frames.splice(0)) frame(0);
    });

    expect(document.startViewTransition).not.toHaveBeenCalled();
    expect(rootTheme()).toEqual({ className: 'light', attribute: 'light' });
  });
});
