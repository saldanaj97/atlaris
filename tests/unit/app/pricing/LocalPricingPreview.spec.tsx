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
    const free = screen.getByRole('article', { name: 'Free' });

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
    expect(within(free).queryByText(/renews automatically/i)).toBeNull();
    for (const card of [free, starter, pro]) {
      expect(
        within(card).getByRole('button', { name: 'Preview only' }),
      ).toBeDisabled();
    }
  });
});
