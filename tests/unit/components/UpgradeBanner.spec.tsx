import { UpgradeBanner } from '@/components/ui/upgrade-banner';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('UpgradeBanner', () => {
  it('links the outlined plan action to pricing', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();

    render(<UpgradeBanner onNavigate={onNavigate} />);

    expect(
      screen.getByRole('heading', { name: 'Upgrade to Pro' }),
    ).toBeVisible();
    expect(
      screen.getByText('Unlock more learning paths, projects, and features.'),
    ).toBeVisible();

    const action = screen.getByRole('link', { name: 'View plans' });
    expect(action).toHaveAttribute('href', '/pricing');

    await user.click(action);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
