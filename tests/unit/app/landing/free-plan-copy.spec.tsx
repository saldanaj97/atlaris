import { CtaSection } from '@/app/(landing)/landing/components/CtaSection';
import { HeroSection } from '@/app/(landing)/landing/components/HeroSection';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/font/google', () => ({
  IBM_Plex_Mono: () => ({ className: '', variable: '' }),
  Instrument_Serif: () => ({ className: '', variable: '' }),
  Sora: () => ({ className: '', variable: '' }),
  Work_Sans: () => ({ className: '', variable: '' }),
}));

// Free allows one plan in total, not one plan at a time, so the landing copy
// must not call it an "active" plan.
describe('landing Free plan copy', () => {
  it('describes the hero Free plan as one plan', () => {
    const { container } = render(<HeroSection />);

    expect(
      screen.getByText(/Free plan: one plan, up to two weeks/),
    ).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/active plan/i);
  });

  it('describes the closing Free plan as one plan', () => {
    const { container } = render(<CtaSection />);

    expect(
      screen.getByText('Free plan: one plan, up to two weeks.'),
    ).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/active plan/i);
  });
});
