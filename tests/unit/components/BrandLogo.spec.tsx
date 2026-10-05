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
      '--lockup-width': `${light.width}px`,
      '--lockup-height': `${light.height}px`,
    });
    expect(darkImage?.parentElement).toHaveStyle({
      '--lockup-width': `${dark.width}px`,
      '--lockup-height': `${dark.height}px`,
    });
    expect(lightImage).toHaveStyle({
      '--lockup-image-width': `${light.imageWidth}px`,
      '--lockup-image-height': `${light.imageHeight}px`,
      '--lockup-offset-x': `${light.offsetX}px`,
      '--lockup-offset-y': `${light.offsetY}px`,
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
      '--lockup-width': `${compact.width}px`,
      '--lockup-height': `${compact.height}px`,
    });
    expect(compact.width).toBe(128);
  });
});
