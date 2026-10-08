import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  shouldUseClerkUi: vi.fn(),
}));

vi.mock('@/lib/auth/local-identity', () => ({
  shouldUseClerkUi: mocks.shouldUseClerkUi,
}));

vi.mock('@/app/(landing)/_shared/star-field.module.css', () => ({
  default: { star: 'star' },
}));

vi.mock('@/app/(landing)/waitlist/components/WaitlistForm', () => ({
  WaitlistForm: () => <div data-testid='waitlist-form' />,
  WaitlistFormPreview: () => <div data-testid='waitlist-form-preview' />,
}));

async function renderWaitlistPage(from?: string): Promise<void> {
  const { default: WaitlistPage } =
    await import('@/app/(landing)/waitlist/page');
  render(await WaitlistPage({ searchParams: Promise.resolve({ from }) }));
}

describe('WaitlistPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.shouldUseClerkUi.mockReturnValue(true);
  });

  it.each([
    [undefined, 'Opening soon', /getting ready to open/],
    ['sign-in', 'Accounts open at launch', /no account to sign in to/],
    ['sign-up', 'Sign-ups open soon', /isn’t open yet\. Join the waitlist/],
    ['unexpected', 'Opening soon', /getting ready to open/],
  ])('tailors copy for from=%s', async (from, overline, body) => {
    await renderWaitlistPage(from);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Be first through the door.',
      }),
    ).toBeVisible();
    expect(screen.getByText(overline)).toBeVisible();
    expect(screen.getByText(body)).toBeVisible();
    expect(screen.getByTestId('waitlist-form')).toBeInTheDocument();
  });

  it('renders the disabled preview when Clerk UI is unavailable', async () => {
    mocks.shouldUseClerkUi.mockReturnValue(false);

    await renderWaitlistPage();

    expect(screen.getByTestId('waitlist-form-preview')).toBeInTheDocument();
    expect(screen.queryByTestId('waitlist-form')).not.toBeInTheDocument();
  });
});
