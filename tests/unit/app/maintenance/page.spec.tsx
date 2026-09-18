import MaintenancePage from '@/app/maintenance/page';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('MaintenancePage', () => {
  it('places the compact support footer after the maintenance content', () => {
    render(<MaintenancePage />);

    const main = screen.getByRole('main');
    const footer = screen.getByRole('contentinfo');

    expect(main).toHaveAttribute('tabindex', '-1');
    expect(within(main).getByLabelText('Atlaris')).toBeInTheDocument();
    expect(
      within(main).queryByRole('link', { name: 'Atlaris - Go to homepage' }),
    ).not.toBeInTheDocument();
    expect(main).toContainElement(
      screen.getByRole('heading', {
        level: 1,
        name: 'We’ll be back soon.',
      }),
    );
    expect(
      within(main).getByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument();
    expect(
      within(main).getByText(
        /Atlaris is temporarily unavailable while maintenance is in progress/,
      ),
    ).toBeInTheDocument();
    expect(main.nextElementSibling).toBe(footer);
    expect(
      within(footer).getByRole('link', { name: 'support@atlaris.app' }),
    ).toHaveAttribute('href', 'mailto:support@atlaris.app');
    expect(
      within(footer).queryByRole('navigation', { name: 'Footer' }),
    ).not.toBeInTheDocument();
    expect(
      within(footer).queryByRole('link', { name: 'Atlaris - Go to homepage' }),
    ).not.toBeInTheDocument();
    expect(within(footer).getByLabelText('Atlaris')).toBeInTheDocument();
    expect(
      screen.queryByText(/A brighter future takes a little patience/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Learn. Build. Go further.'),
    ).not.toBeInTheDocument();
  });

  it('renders the decorative mountain-lake backdrop artwork', () => {
    const { container } = render(<MaintenancePage />);

    const backdrop = container.querySelector(
      '[data-slot="responsive-backdrop"]',
    );
    expect(backdrop).not.toBeNull();
    expect(backdrop).toHaveAttribute('aria-hidden', 'true');
    expect(
      container.querySelector('img[src*="maintenance-backdrop-desktop.jpg"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('img[src*="maintenance-backdrop-mobile.jpg"]'),
    ).not.toBeNull();
  });
});
