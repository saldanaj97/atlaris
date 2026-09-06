import { SettingsScrollTarget } from '@/app/(app)/settings/components/SettingsScrollTarget';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  usePathnameMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: mocks.usePathnameMock,
}));

const scrollIntoViewMock = vi.fn();
window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;

function renderAnchoredPage(): ReturnType<typeof render> {
  document.body.insertAdjacentHTML(
    'afterbegin',
    `
      <nav aria-label="Settings sections">
        <a href="#profile" data-settings-section-link="true" data-section-id="profile">Profile</a>
        <a href="#billing" data-settings-section-link="true" data-section-id="billing">Billing</a>
        <a href="#notifications" data-settings-section-link="true" data-section-id="notifications">Notifications</a>
      </nav>
      <section id="profile"></section>
      <section id="billing"></section>
      <section id="notifications"></section>
    `,
  );

  return render(<SettingsScrollTarget />);
}

describe('SettingsScrollTarget', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.history.replaceState({}, '', '/settings');
    mocks.usePathnameMock.mockReturnValue('/settings');
    scrollIntoViewMock.mockClear();
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
    window.history.replaceState({}, '', '/settings');
    vi.clearAllMocks();
  });

  it('activates and scrolls to the initial valid hash target', async () => {
    window.history.replaceState({}, '', '/settings#billing');

    renderAnchoredPage();

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Billing' })).toHaveAttribute(
        'aria-current',
        'location',
      );
    });

    expect(screen.getByRole('link', { name: 'Profile' })).not.toHaveAttribute(
      'aria-current',
    );
    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    });
  });

  it('updates the active link on native anchor navigation and removes the listener on cleanup', async () => {
    const user = userEvent.setup();
    const { unmount } = renderAnchoredPage();

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute(
        'aria-current',
        'location',
      );
    });

    const notifications = document.getElementById('notifications');
    const notificationsScrollMock = vi.fn();
    if (notifications) {
      notifications.scrollIntoView = notificationsScrollMock;
    }

    await user.click(screen.getByRole('link', { name: 'Notifications' }));

    await waitFor(() => {
      expect(
        screen.getByRole('link', { name: 'Notifications' }),
      ).toHaveAttribute('aria-current', 'location');
    });

    expect(screen.getByRole('link', { name: 'Profile' })).not.toHaveAttribute(
      'aria-current',
    );
    expect(notificationsScrollMock).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    });
    expect(window.location.hash).toBe('#notifications');

    unmount();
    notificationsScrollMock.mockClear();
    await user.click(screen.getByRole('link', { name: 'Billing' }));

    expect(notificationsScrollMock).not.toHaveBeenCalled();
  });
});
