import SiteFooter from '@/components/shared/SiteFooter';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('SiteFooter', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('should render footer element', () => {
    const { container } = render(<SiteFooter />);

    const footer = container.querySelector('footer');
    expect(footer).toBeInTheDocument();
  });

  it('should display Atlaris branding', () => {
    render(<SiteFooter />);

    expect(screen.getByText('Atlaris')).toBeInTheDocument();
  });

  it('should display copyright notice', () => {
    render(<SiteFooter />);

    expect(screen.getByText(/© 2025 Atlaris/i)).toBeInTheDocument();
    expect(screen.getByText(/All rights reserved/i)).toBeInTheDocument();
  });

  it('should display BookOpen icon', () => {
    const { container } = render(<SiteFooter />);

    // Check for lucide icon (svg)
    const icon = container.querySelector('svg');
    expect(icon).toBeInTheDocument();
  });

  it('should have a border at the top', () => {
    const { container } = render(<SiteFooter />);

    const footer = container.querySelector('footer');
    expect(footer).toBeInTheDocument();
    expect(footer).toHaveClass('border-t');
  });

  it('should contain branding, navigation links, and copyright sections', () => {
    render(<SiteFooter />);

    // Branding section
    expect(screen.getByText('Atlaris')).toBeInTheDocument();

    // Navigation links
    expect(
      screen.getByRole('navigation', { name: /footer/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /about/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /pricing/i })).toBeInTheDocument();

    // Copyright
    expect(screen.getByText(/© \d{4} Atlaris/i)).toBeInTheDocument();
  });

  it('should have navigation links with correct hrefs', () => {
    render(<SiteFooter />);

    expect(screen.getByRole('link', { name: /about/i })).toHaveAttribute(
      'href',
      '/about'
    );
    expect(screen.getByRole('link', { name: /pricing/i })).toHaveAttribute(
      'href',
      '/pricing'
    );
  });

  it('should display branding with logo icon', () => {
    const { container } = render(<SiteFooter />);

    // Check for logo SVG icon
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(screen.getByText('Atlaris')).toBeInTheDocument();
  });

  it('should display copyright with current year', () => {
    render(<SiteFooter />);

    const currentYear = new Date().getFullYear();
    expect(
      screen.getByText(new RegExp(`© ${currentYear} Atlaris`))
    ).toBeInTheDocument();
  });

  it('should render as an accessible footer landmark', () => {
    render(<SiteFooter />);

    const footer = screen.getByRole('contentinfo');
    expect(footer).toBeInTheDocument();
  });
});
