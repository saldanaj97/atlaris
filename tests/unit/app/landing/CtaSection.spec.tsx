import { CtaSection } from '@/app/(landing)/landing/components/CtaSection';
import { ROUTES } from '@/features/navigation/routes';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/(landing)/landing/components/landing.module.css', () => ({
  default: {
    ctaMotion: 'ctaMotion',
    revealItem: 'revealItem',
    revealScale: 'revealScale',
  },
}));

describe('CtaSection', () => {
  it('renders the landing closer copy and a single start action', () => {
    render(<CtaSection />);

    expect(screen.getByText('Your next chapter')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'A brighter future is a skill away',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Start your learning journey today and get closer to the future you want.',
      ),
    ).toBeInTheDocument();

    const startLink = screen.getByRole('link', { name: 'Get started free' });
    expect(startLink).toHaveAttribute('href', ROUTES.PLANS.NEW);
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(
      screen.queryByRole('link', { name: 'Begin tonight' }),
    ).not.toBeInTheDocument();
  });
});
