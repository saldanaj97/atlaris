import SiteFooter from '@/components/shared/SiteFooter';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('SiteFooter', () => {
  it('renders the public marketing destinations and support action by default', () => {
    render(<SiteFooter />);

    const footer = screen.getByRole('contentinfo');
    const navigation = within(footer).getByRole('navigation', {
      name: 'Footer',
    });

    expect(
      within(navigation).getByRole('link', { name: 'Home' }),
    ).toHaveAttribute('href', '/landing');
    expect(
      within(navigation).getByRole('link', { name: 'Pricing' }),
    ).toHaveAttribute('href', '/pricing');
    expect(
      within(navigation).getByRole('link', { name: 'About' }),
    ).toHaveAttribute('href', '/about');
    expect(
      within(footer).getByRole('link', { name: 'support@atlaris.app' }),
    ).toHaveAttribute('href', 'mailto:support@atlaris.app');
    expect(
      within(footer).getByText(/Atlaris\. All rights reserved\./),
    ).toBeInTheDocument();
  });

  it('renders a compact maintenance footer with real support and no marketing navigation', () => {
    render(<SiteFooter variant='maintenance' />);

    const footer = screen.getByRole('contentinfo');

    expect(
      within(footer).getByRole('link', { name: 'support@atlaris.app' }),
    ).toHaveAttribute('href', 'mailto:support@atlaris.app');
    expect(
      within(footer).getByText('Learn. Build. Go further.'),
    ).toBeInTheDocument();
    expect(
      within(footer).queryByRole('navigation', { name: 'Footer' }),
    ).not.toBeInTheDocument();
    expect(
      within(footer).queryByRole('link', { name: 'Pricing' }),
    ).not.toBeInTheDocument();
  });
});
