import type { AnchorHTMLAttributes } from 'react';

import {
  SettingsContentHeading,
  SettingsLegacyHashRedirect,
  SettingsSectionNavigation,
} from '@/app/(app)/settings/components/SettingsScrollTarget';
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  usePathnameMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: mocks.usePathnameMock,
  useRouter: () => ({
    replace: mocks.replaceMock,
  }),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function renderSettingsNav(): ReturnType<typeof render> {
  return render(
    <>
      <SettingsSectionNavigation />
      <SettingsContentHeading />
    </>,
  );
}

function contentHeading(): HTMLElement {
  return within(screen.getByTestId('settings-content-heading')).getByRole(
    'heading',
  );
}

describe('SettingsSectionNavigation', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.history.replaceState({}, '', '/settings/profile');
    mocks.usePathnameMock.mockReturnValue('/settings/profile');
    mocks.replaceMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
    window.history.replaceState({}, '', '/settings/profile');
    vi.clearAllMocks();
  });

  it('marks the pathname section current and links to settings subroutes', () => {
    mocks.usePathnameMock.mockReturnValue('/settings/billing');

    renderSettingsNav();

    expect(
      screen.getByRole('link', { name: /Plan & billing/ }),
    ).toHaveAttribute('href', '/settings/billing');
    expect(
      screen.getByRole('link', { name: /Plan & billing/ }),
    ).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Profile/ })).toHaveAttribute(
      'href',
      '/settings/profile',
    );
    expect(screen.getByRole('link', { name: /Profile/ })).not.toHaveAttribute(
      'aria-current',
    );
    expect(contentHeading()).toHaveTextContent('Account');
  });

  it('updates the content heading from the active settings route', () => {
    const { rerender } = renderSettingsNav();

    expect(contentHeading()).toHaveTextContent('Account');

    mocks.usePathnameMock.mockReturnValue('/settings/notifications');
    rerender(
      <>
        <SettingsSectionNavigation />
        <SettingsContentHeading />
      </>,
    );

    expect(screen.getByRole('link', { name: /Notifications/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(contentHeading()).toHaveTextContent('Notifications');

    mocks.usePathnameMock.mockReturnValue('/settings/billing');
    rerender(
      <>
        <SettingsSectionNavigation />
        <SettingsContentHeading />
      </>,
    );

    expect(contentHeading()).toHaveTextContent('Account');
  });

  it('treats unmatched settings paths as profile for nav state', () => {
    mocks.usePathnameMock.mockReturnValue('/settings/user-profile');

    renderSettingsNav();

    expect(screen.getByRole('link', { name: /Profile/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(contentHeading()).toHaveTextContent('Account');
  });
});

describe('SettingsLegacyHashRedirect', () => {
  beforeEach(() => {
    mocks.replaceMock.mockReset();
    mocks.usePathnameMock.mockReturnValue('/settings/profile');
    window.history.replaceState({}, '', '/settings/profile');
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState({}, '', '/settings/profile');
    vi.clearAllMocks();
  });

  it('replaces a leftover section hash with the matching settings route', async () => {
    window.history.replaceState({}, '', '/settings/profile#billing');

    render(<SettingsLegacyHashRedirect />);

    await waitFor(() => {
      expect(mocks.replaceMock).toHaveBeenCalledWith('/settings/billing');
    });
  });

  it('preserves checkout query when rewriting a billing hash', async () => {
    mocks.usePathnameMock.mockReturnValue('/settings/profile');
    window.history.replaceState({}, '', '/settings/profile?checkout=1#billing');

    render(<SettingsLegacyHashRedirect />);

    await waitFor(() => {
      expect(mocks.replaceMock).toHaveBeenCalledWith(
        '/settings/billing?checkout=1',
      );
    });
  });

  it('does not rewrite when there is no section hash', () => {
    render(<SettingsLegacyHashRedirect />);

    expect(mocks.replaceMock).not.toHaveBeenCalled();
  });
});
