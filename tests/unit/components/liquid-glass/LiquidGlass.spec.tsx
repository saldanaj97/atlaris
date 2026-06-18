import {
  DEFAULT_LIQUID_GLASS_PHYSICS,
  LiquidGlass,
  LiquidGlassLayer,
  PRICING_HEADER_PHYSICS,
  resolveLiquidGlassPhysics,
} from '@/components/shared/liquid-glass';
import * as generateLensMapModule from '@/components/shared/liquid-glass/generate-lens-map';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

function createMatchMediaMock(matches: boolean) {
  return vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function mockMotionPreference(matches: boolean): void {
  vi.stubGlobal('matchMedia', createMatchMediaMock(matches));
}

function enableDynamicLiquidGlass(): void {
  vi.stubGlobal('SVGFEDisplacementMapElement', class {});
  vi.stubGlobal('SVGFEImageElement', class {});
  vi.spyOn(generateLensMapModule, 'getLensMapDataUrl').mockReturnValue(
    'data:image/png;base64,mock',
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('LiquidGlass', () => {
  it('keeps the decorative glass layer behind interactive content', () => {
    mockMotionPreference(false);

    render(
      <LiquidGlass
        lens={{ width: 32, height: 16, borderRadius: 8 }}
        fallbackClassName='bg-white/40 backdrop-blur-sm'
      >
        <button type='button'>Open navigation</button>
      </LiquidGlass>,
    );

    const button = screen.getByRole('button', { name: 'Open navigation' });
    const shell = button.closest('[data-slot="liquid-glass"]');
    const glassLayer = shell?.querySelector('[aria-hidden="true"]');

    expect(button).toBeEnabled();
    expect(glassLayer).toHaveClass(
      'pointer-events-none',
      'absolute',
      'inset-0',
      '-z-10',
    );
  });

  it('falls back to static glass when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);

    render(
      <LiquidGlass
        lens={{ width: 32, height: 16, borderRadius: 8 }}
        fallbackClassName='bg-white/40 backdrop-blur-sm'
      >
        <button type='button'>Open navigation</button>
      </LiquidGlass>,
    );

    expect(
      screen.getByRole('button', { name: 'Open navigation' }),
    ).toBeEnabled();
    expect(document.querySelector('filter')).toBeNull();
  });

  it('renders the SVG displacement filter when motion is allowed', () => {
    mockMotionPreference(false);
    enableDynamicLiquidGlass();

    render(
      <LiquidGlass
        lens={{ width: 32, height: 16, borderRadius: 8 }}
        fallbackClassName='bg-white/40 backdrop-blur-sm'
      >
        <button type='button'>Open navigation</button>
      </LiquidGlass>,
    );

    expect(document.querySelector('feDisplacementMap')).not.toBeNull();
    const glassLayer = screen
      .getByRole('button', { name: 'Open navigation' })
      .closest('[data-slot="liquid-glass"]')
      ?.querySelector('[aria-hidden="true"]') as HTMLElement | null;

    expect(glassLayer?.style.filter).toMatch(/^url\(#/);
  });

  it('defers the displacement filter until the container has dimensions', () => {
    mockMotionPreference(false);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 0,
      height: 0,
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    render(
      <LiquidGlass
        lens={{ width: 0, height: 0, borderRadius: 8 }}
        fallbackClassName='bg-white/40 backdrop-blur-sm'
        className='h-16 w-32'
      >
        <button type='button'>Open navigation</button>
      </LiquidGlass>,
    );

    expect(document.querySelector('filter')).toBeNull();
  });

  it('updates auto-sized lenses when ResizeObserver reports a new size', () => {
    mockMotionPreference(false);
    enableDynamicLiquidGlass();

    let observerCallback: ResizeObserverCallback | undefined;
    class TestResizeObserver {
      observe() {}

      unobserve() {}

      disconnect() {}

      constructor(callback: ResizeObserverCallback) {
        observerCallback = callback;
      }
    }

    vi.stubGlobal('ResizeObserver', TestResizeObserver);

    render(
      <LiquidGlass
        lens={{ width: 0, height: 0, borderRadius: 8 }}
        fallbackClassName='bg-white/40 backdrop-blur-sm'
        className='h-16 w-32'
      >
        <button type='button'>Open navigation</button>
      </LiquidGlass>,
    );

    act(() => {
      observerCallback?.(
        [
          {
            contentRect: { width: 128, height: 64 } as DOMRectReadOnly,
          } as ResizeObserverEntry,
        ],
        {} as ResizeObserver,
      );
    });

    expect(document.querySelector('feDisplacementMap')).not.toBeNull();
  });
});

describe('LiquidGlassLayer', () => {
  it('renders as an inert decorative layer with fallback classes', () => {
    mockMotionPreference(true);

    render(
      <LiquidGlassLayer
        lens={{ width: 32, height: 16, borderRadius: 8 }}
        fallbackClassName='bg-white/40 backdrop-blur-sm'
        className='absolute inset-0 rounded-2xl'
      />,
    );

    const layer = document.querySelector('[data-slot="liquid-glass-layer"]');

    expect(layer).toHaveAttribute('aria-hidden', 'true');
    expect(layer).toBeEmptyDOMElement();
    expect(layer).toHaveClass(
      'pointer-events-none',
      'overflow-hidden',
      'bg-white/40',
      'backdrop-blur-sm',
      'absolute',
      'inset-0',
      'rounded-2xl',
    );
  });

  it('applies rounded clipping styles while waiting for measurement', () => {
    mockMotionPreference(false);

    render(
      <LiquidGlassLayer
        lens={{ width: 0, height: 0, borderRadius: 16 }}
        fallbackClassName='bg-white/40 backdrop-blur-sm'
        className='size-full rounded-2xl'
      />,
    );

    const layer = document.querySelector('[data-slot="liquid-glass-layer"]');

    expect(layer).toHaveStyle({
      borderRadius: '16px',
      clipPath: 'inset(0 round 16px)',
    });
    expect(document.querySelector('filter')).toBeNull();
  });

  it('renders chromatic and edge-highlight filter nodes for CTA physics', () => {
    mockMotionPreference(false);
    enableDynamicLiquidGlass();

    render(
      <LiquidGlassLayer
        lens={{ width: 48, height: 24, borderRadius: 12 }}
        physics={{
          scale: 18,
          depth: 0.6,
          curvature: 1.8,
          splay: 1.5,
          chroma: 0.2,
          edgeHighlight: 0.5,
        }}
        fallbackClassName='bg-white/40 backdrop-blur-sm'
      />,
    );

    expect(document.querySelector('feBlend[result="chroma"]')).not.toBeNull();
    expect(document.querySelector('feSpecularLighting')).not.toBeNull();
  });
});

describe('resolveLiquidGlassPhysics', () => {
  it('uses the default preset for intensity="default"', () => {
    expect(resolveLiquidGlassPhysics('default')).toEqual(
      DEFAULT_LIQUID_GLASS_PHYSICS,
    );
  });

  it('uses the pricing preset for intensity="subtle"', () => {
    expect(resolveLiquidGlassPhysics('subtle')).toEqual(PRICING_HEADER_PHYSICS);
  });

  it('merges physics overrides on top of the selected preset', () => {
    expect(resolveLiquidGlassPhysics('default', { scale: 99 })).toEqual({
      ...DEFAULT_LIQUID_GLASS_PHYSICS,
      scale: 99,
    });
  });
});
