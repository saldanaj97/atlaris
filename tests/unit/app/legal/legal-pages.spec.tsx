import PrivacyPage from '@/app/(landing)/privacy/page';
import TermsPage from '@/app/(landing)/terms/page';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/(landing)/_shared/star-field.module.css', () => ({
  default: { star: 'star' },
}));

describe('legal pages', () => {
  it.each([
    ['Terms of Service', TermsPage],
    ['Privacy Policy', PrivacyPage],
  ])('renders the %s page', (heading, Page) => {
    render(<Page />);

    expect(
      screen.getByRole('heading', { level: 1, name: heading }),
    ).toBeInTheDocument();
  });
});
