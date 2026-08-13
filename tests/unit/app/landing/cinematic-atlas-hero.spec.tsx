import { CinematicAtlasHero } from '@/app/(marketing)/landing/components/CinematicAtlasHero';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/landing',
}));

beforeEach(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

vi.mock('@/app/(marketing)/_shared/StarField', () => ({
  StarField: () => null,
}));

describe('CinematicAtlasHero', () => {
  it('renders the After Hours headline without waitlist claims', () => {
    render(<CinematicAtlasHero submitDelayMs={0} />);

    expect(
      screen.getByRole('heading', { name: /a map for the quiet hours/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/for the hour after the day lets go/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/waitlist/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/7,943/)).not.toBeInTheDocument();
  });

  it('swaps the email capture to a sign-up handoff after a valid submit', async () => {
    const user = userEvent.setup();
    render(<CinematicAtlasHero submitDelayMs={0} />);

    await user.type(screen.getByLabelText('Email'), 'ada@atlaris.app');
    await user.click(screen.getByRole('button', { name: /begin tonight/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      /we'll hold the route/i,
    );
    expect(
      screen.getByRole('link', { name: /create your account/i }),
    ).toHaveAttribute(
      'href',
      '/auth/sign-up?email_address=' + encodeURIComponent('ada@atlaris.app'),
    );
  });

  it('keeps the email form when the address is empty', async () => {
    const user = userEvent.setup();
    render(<CinematicAtlasHero submitDelayMs={0} />);

    await user.click(screen.getByRole('button', { name: /begin tonight/i }));

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
