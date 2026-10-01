import BrandLogo from '@/components/shared/BrandLogo';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('BrandLogo', () => {
  it('links to a custom destination when href is provided', () => {
    render(<BrandLogo href='/dashboard' />);

    expect(
      screen.getByRole('link', { name: 'Atlaris - Go to homepage' }),
    ).toHaveAttribute('href', '/dashboard');
  });

  it('links home by default', () => {
    render(<BrandLogo />);

    expect(
      screen.getByRole('link', { name: 'Atlaris - Go to homepage' }),
    ).toHaveAttribute('href', '/landing');
  });

  it('can render the lockup without a home destination', () => {
    render(<BrandLogo linked={false} />);

    expect(screen.getByLabelText('Atlaris')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Atlaris - Go to homepage' }),
    ).not.toBeInTheDocument();
  });
});
