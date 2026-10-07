import MaintenancePage from '@/app/maintenance/page';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/(landing)/_shared/star-field.module.css', () => ({
  default: { star: 'star' },
}));

describe('MaintenancePage', () => {
  it('places the compact support footer after the maintenance content', () => {
    render(<MaintenancePage />);

    const main = screen.getByRole('main');
    const footer = screen.getByRole('contentinfo');

    expect(main).toHaveAttribute('tabindex', '-1');
    // Marketing pages stay live during maintenance, so the header logo links back.
    expect(
      within(main).getByRole('link', { name: 'Atlaris - Go to homepage' }),
    ).toHaveAttribute('href', '/landing');
    expect(main).toContainElement(
      screen.getByRole('heading', {
        level: 1,
        name: 'We’ll be back soon.',
      }),
    );
    expect(
      within(main).getByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument();
    expect(within(main).queryByText('Maintenance')).not.toBeInTheDocument();
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

  it('renders the decorative star backdrop without photo artwork', () => {
    const { container } = render(<MaintenancePage />);

    const star = container.querySelector('.star');
    expect(star).not.toBeNull();
    expect(star?.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(
      container.querySelector('[data-slot="responsive-backdrop"]'),
    ).toBeNull();
    expect(
      container.querySelector('img[src*="maintenance-backdrop"]'),
    ).toBeNull();
  });
});
