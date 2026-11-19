import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/(landing)/pricing/components/PricingCards.module.css', () => ({
  default: {},
}));

describe('LocalPricingPreview', () => {
  it('shows the live Clerk prices with renewal terms and disabled checkout', async () => {
    const { LocalPricingPreview } =
      await import('@/app/(landing)/pricing/components/LocalPricingPreview');
    render(<LocalPricingPreview />);

    const starter = screen.getByRole('article', { name: 'Starter' });
    const pro = screen.getByRole('article', { name: 'Pro' });

    expect(within(starter).getByText('$25')).toBeVisible();
    expect(within(pro).getByText('$100')).toBeVisible();
    expect(
      within(starter).getByText(
        /\$25 USD billed monthly\. Renews automatically every month until you cancel\./,
      ),
    ).toBeVisible();
    expect(
      within(pro).getByText(/\$100 USD billed monthly\. Renews automatically/),
    ).toBeVisible();
    expect(screen.queryByRole('article', { name: 'Free' })).toBeNull();
    for (const card of [starter, pro]) {
      expect(
        within(card).getByRole('button', { name: 'Preview only' }),
      ).toBeDisabled();
    }
  });
});

describe('LocalPricingPreview comparison', () => {
  it('compares plans with priced column headers and a value in every cell', async () => {
    const { LocalPricingPreview } =
      await import('@/app/(landing)/pricing/components/LocalPricingPreview');
    render(<LocalPricingPreview />);

    expect(
      screen.getByRole('heading', { name: 'Compare plans' }),
    ).toBeVisible();

    const table = screen.getByRole('table', { name: 'Plan comparison' });
    const headers = within(table).getAllByRole('columnheader');
    expect(headers.map((header) => header.textContent)).toEqual([
      'Feature',
      'Starter$25 per month',
      'Pro$100 per month',
    ]);

    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(5);
    const plansIncluded = within(rows[0]).getAllByRole('cell');
    expect(plansIncluded.map((cell) => cell.textContent)).toEqual([
      '10 at a time',
      'Unlimited',
    ]);
    for (const row of rows) {
      for (const cell of within(row).getAllByRole('cell')) {
        expect(cell.textContent?.trim()).not.toBe('');
      }
    }
    expect(within(rows[4]).getAllByText('Included')).toHaveLength(2);
  });

  it('keeps the scrollable comparison region reachable by keyboard', async () => {
    const { LocalPricingPreview } =
      await import('@/app/(landing)/pricing/components/LocalPricingPreview');
    render(<LocalPricingPreview />);

    expect(
      screen.getByRole('region', { name: 'Plan comparison' }),
    ).toHaveAttribute('tabindex', '0');
  });
});
