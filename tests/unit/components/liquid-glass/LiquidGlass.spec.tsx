import {
  LiquidGlass,
  LiquidGlassLayer,
} from '@/components/shared/liquid-glass';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

function mockMotionPreference(matches: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
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
});
