import MaintenancePage from '@/app/maintenance/page';
import { render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

  it('keeps the static fallback truthful and operable without a home loop', () => {
    const html = readFileSync(
      join(process.cwd(), 'public', 'maintenance.html'),
      'utf8',
    );

    expect(html).toContain('Try again');
    expect(html).toContain('Please try again in a few minutes');
    expect(html).toContain('mailto:support@atlaris.app');
    expect(html).not.toContain('Back home');
    expect(html).not.toContain('zero-downtime');
    expect(html).not.toContain('Expected to be back online shortly');
  });
});
