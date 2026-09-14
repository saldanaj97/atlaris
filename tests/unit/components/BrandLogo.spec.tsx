import BrandLogo from '@/components/shared/BrandLogo';
import { getBrandLockupLayout } from '@/shared/constants/brand-assets';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

function lockupImage(name: 'logo-on-light.png' | 'logo-on-dark.png') {
  return document.querySelector(`img[src*="${name}"]`);
}

describe('BrandLogo', () => {
  it('links home and crops both lockups to the shared visible width', () => {
    render(<BrandLogo />);

    expect(
      screen.getByRole('link', { name: 'Atlaris - Go to homepage' }),
    ).toHaveAttribute('href', '/landing');

    const light = getBrandLockupLayout('light', 'md');
    const dark = getBrandLockupLayout('dark', 'md');
    const lightImage = lockupImage('logo-on-light.png');
    const darkImage = lockupImage('logo-on-dark.png');

    expect(lightImage).not.toBeNull();
    expect(darkImage).not.toBeNull();
    expect(lightImage?.parentElement).toHaveStyle({
      width: `${light.width}px`,
      height: `${light.height}px`,
    });
    expect(darkImage?.parentElement).toHaveStyle({
      width: `${dark.width}px`,
      height: `${dark.height}px`,
    });
  });

  it('can render the lockup without a home destination', () => {
    render(<BrandLogo linked={false} />);

    expect(screen.getByLabelText('Atlaris')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Atlaris - Go to homepage' }),
    ).not.toBeInTheDocument();
  });

  it('uses the compact visible width for sidebar and mobile chrome', () => {
    render(<BrandLogo size='sm' />);

    const compact = getBrandLockupLayout('light', 'sm');
    expect(lockupImage('logo-on-light.png')?.parentElement).toHaveStyle({
      width: `${compact.width}px`,
      height: `${compact.height}px`,
    });
    expect(compact.width).toBe(128);
  });
});
