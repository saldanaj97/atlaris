import MaintenancePage from '@/app/maintenance/page';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('MaintenancePage', () => {
  it('places the compact support footer after the maintenance content', () => {
    render(<MaintenancePage />);

    const main = screen.getByRole('main');
    const footer = screen.getByRole('contentinfo');

    expect(main).toHaveAttribute('tabindex', '-1');
    expect(main).toContainElement(
      screen.getByRole('heading', {
        level: 1,
        name: 'We’ll be back soon.',
      }),
    );
    const status = within(main).getByRole('region', {
      name: 'System improvements in progress',
    });
    expect(
      within(status).getByRole('heading', {
        level: 2,
        name: 'System improvements in progress',
      }),
    ).toBeInTheDocument();
    expect(
      within(status).getByText(/Please try again in a few minutes\./),
    ).toBeInTheDocument();
    expect(main.nextElementSibling).toBe(footer);
    expect(
      within(footer).getByRole('link', { name: 'support@atlaris.app' }),
    ).toHaveAttribute('href', 'mailto:support@atlaris.app');
    expect(
      within(footer).queryByRole('navigation', { name: 'Footer' }),
    ).not.toBeInTheDocument();
  });
});
