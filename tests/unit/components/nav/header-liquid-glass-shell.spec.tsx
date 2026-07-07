import HeaderLiquidGlassShell from '@/components/shared/nav/HeaderLiquidGlassShell';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('HeaderLiquidGlassShell', () => {
  it('renders children without a liquid glass layer on opaque routes', () => {
    render(
      <HeaderLiquidGlassShell layout='desktop' variant='opaque'>
        <span>Header content</span>
      </HeaderLiquidGlassShell>,
    );

    expect(screen.getByText('Header content')).toBeInTheDocument();
    expect(
      document.querySelector('[data-slot="liquid-glass-layer"]'),
    ).toBeNull();
  });

  it('mounts a decorative liquid glass layer for marketing routes', () => {
    render(
      <HeaderLiquidGlassShell layout='desktop' variant='marketing'>
        <span>Marketing header</span>
      </HeaderLiquidGlassShell>,
    );

    expect(screen.getByText('Marketing header')).toBeInTheDocument();
    expect(
      document.querySelector('[data-slot="liquid-glass-layer"]'),
    ).toHaveAttribute('aria-hidden', 'true');
  });

  it('mounts a decorative liquid glass layer for protected routes', () => {
    render(
      <HeaderLiquidGlassShell layout='desktop' variant='protected'>
        <span>Protected header</span>
      </HeaderLiquidGlassShell>,
    );

    expect(screen.getByText('Protected header')).toBeInTheDocument();
    expect(
      document.querySelector('[data-slot="liquid-glass-layer"]'),
    ).toHaveAttribute('aria-hidden', 'true');
  });

  it('uses the pricing glass surface classes on pricing routes', () => {
    render(
      <HeaderLiquidGlassShell layout='mobile' variant='pricing'>
        <span>Pricing header</span>
      </HeaderLiquidGlassShell>,
    );

    const layer = document.querySelector('[data-slot="liquid-glass-layer"]');

    expect(layer).toHaveClass('bg-primary/5', 'dark:bg-primary/10');
  });

  it('clips the glass layer on an inner wrapper so the shell can show focus rings', () => {
    render(
      <HeaderLiquidGlassShell layout='desktop' variant='marketing'>
        <span>Marketing header</span>
      </HeaderLiquidGlassShell>,
    );

    const shell = screen.getByText('Marketing header').parentElement;
    const glassClipWrapper = document.querySelector(
      '[data-slot="liquid-glass-layer"]',
    )?.parentElement;

    expect(shell?.className).not.toContain('overflow-hidden');
    expect(glassClipWrapper).toHaveClass('overflow-hidden', 'rounded-2xl');
  });
});
