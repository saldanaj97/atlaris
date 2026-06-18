import { LiquidGlassButton } from '@/app/(marketing)/_shared/LiquidGlassButton';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('LiquidGlassButton', () => {
  it('uses a semi-transparent surface so the glass layer shows through', () => {
    render(<LiquidGlassButton>Get started</LiquidGlassButton>);

    const button = screen.getByRole('button', { name: 'Get started' });

    expect(button).toHaveClass('bg-primary/70', 'hover:bg-primary/80');
    expect(button.className).not.toMatch(/\bbg-primary(?![/-])/);
  });

  it('keeps the decorative glass layer behind the interactive button', () => {
    render(<LiquidGlassButton>Get started</LiquidGlassButton>);

    const button = screen.getByRole('button', { name: 'Get started' });
    const shell = button.closest('[data-slot="liquid-glass"]');
    const glassLayer = shell?.querySelector('[aria-hidden="true"]');

    expect(glassLayer).toHaveClass('pointer-events-none', 'absolute', '-z-10');
  });
});
