import PlansError from '@/app/(app)/plans/error';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

describe('PlansError', () => {
  it('omits the create-plan CTA while the plans page is unavailable', () => {
    render(<PlansError error={new Error('load failed')} reset={vi.fn()} />);

    expect(
      screen.queryByRole('link', { name: /new plan/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Try Again' }),
    ).toBeInTheDocument();
  });
});
