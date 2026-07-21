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

  it('does not mount a liquid glass layer for marketing routes', () => {
    render(
      <HeaderLiquidGlassShell layout='desktop' variant='marketing'>
        <span>Marketing header</span>
      </HeaderLiquidGlassShell>,
    );

    expect(screen.getByText('Marketing header')).toBeInTheDocument();
    expect(
      document.querySelector('[data-slot="liquid-glass-layer"]'),
    ).toBeNull();
  });

  it('does not mount a liquid glass layer for protected routes', () => {
    render(
      <HeaderLiquidGlassShell layout='desktop' variant='protected'>
        <span>Protected header</span>
      </HeaderLiquidGlassShell>,
    );

    expect(screen.getByText('Protected header')).toBeInTheDocument();
    expect(
      document.querySelector('[data-slot="liquid-glass-layer"]'),
    ).toBeNull();
  });

  it('uses the flat shell on pricing routes', () => {
    render(
      <HeaderLiquidGlassShell layout='mobile' variant='pricing'>
        <span>Pricing header</span>
      </HeaderLiquidGlassShell>,
    );

    const shell = screen.getByText('Pricing header').parentElement;

    expect(shell).toHaveClass('h-16');
    expect(shell).not.toHaveClass('backdrop-blur');
  });
});
