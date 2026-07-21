import { LiquidGlassButton } from '@/app/(marketing)/_shared/LiquidGlassButton';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('LiquidGlassButton', () => {
  it('renders a solid primary pill without a liquid-glass shell', () => {
    render(<LiquidGlassButton>Get started</LiquidGlassButton>);

    const button = screen.getByRole('button', { name: 'Get started' });

    expect(button).toHaveClass(
      'rounded-full',
      'bg-primary',
      'text-primary-foreground',
      'font-serif',
    );
    expect(button.closest('[data-slot="liquid-glass"]')).toBeNull();
  });
});
