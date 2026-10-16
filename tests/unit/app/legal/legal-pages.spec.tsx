import PrivacyPage, {
  metadata as privacyMetadata,
} from '@/app/(landing)/privacy/page';
import TermsPage, {
  metadata as termsMetadata,
} from '@/app/(landing)/terms/page';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/(landing)/_shared/star-field.module.css', () => ({
  default: { star: 'star' },
}));

describe('legal pages', () => {
  it('renders the Terms of Service with its metadata and contact', () => {
    expect(termsMetadata.title).toBe('Terms of Service | Atlaris');
    expect(termsMetadata.openGraph?.url).toBe('/terms');

    render(<TermsPage />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Terms of Service' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/State of Texas/)).toBeInTheDocument();
    for (const link of screen.getAllByRole('link', {
      name: 'business@juansaldana.dev',
    })) {
      expect(link).toHaveAttribute('href', 'mailto:business@juansaldana.dev');
    }
  });

  it('renders the Privacy Policy with its metadata and service providers', () => {
    expect(privacyMetadata.title).toBe('Privacy Policy | Atlaris');
    expect(privacyMetadata.openGraph?.url).toBe('/privacy');

    render(<PrivacyPage />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Privacy Policy' }),
    ).toBeInTheDocument();
    expect(screen.getByText('PostHog:')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Terms of Service' }),
    ).toHaveAttribute('href', '/terms');
  });
});
