import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import SiteFooter from '@/components/shared/SiteFooter';

describe('SiteFooter', () => {
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

  it('should have responsive layout classes', () => {
    const { container } = render(<SiteFooter />);

    const footer = container.querySelector('footer');
    expect(footer).toHaveClass('container');
    expect(footer).toHaveClass('mx-auto');
    expect(footer).toHaveClass('border-t');
    expect(footer).toHaveClass('py-8');
  });

  it('should have flex layout for content', () => {
    const { container } = render(<SiteFooter />);

    const contentDiv = container.querySelector('.flex');
    expect(contentDiv).toBeInTheDocument();
    expect(contentDiv).toHaveClass('flex-col');
    expect(contentDiv).toHaveClass('md:flex-row');
  });

  it('should display branding and copyright in separate sections', () => {
    const { container } = render(<SiteFooter />);

    // Should have two main sections
    const flexContainer = container.querySelector('.flex.flex-col.items-center.justify-between');
    expect(flexContainer).toBeInTheDocument();
    expect(flexContainer?.children.length).toBe(2);
  });

  it('should apply correct spacing to branding elements', () => {
    const { container } = render(<SiteFooter />);

    const brandingDiv = container.querySelector('.flex.items-center.space-x-2');
    expect(brandingDiv).toBeInTheDocument();
  });

  it('should style copyright text appropriately', () => {
    const { container } = render(<SiteFooter />);

    const copyrightText = screen.getByText(/© 2025 Atlaris/i);
    expect(copyrightText).toHaveClass('text-muted-foreground');
    expect(copyrightText).toHaveClass('text-sm');
  });

  it('should render as an accessible footer landmark', () => {
    render(<SiteFooter />);

    const footer = screen.getByRole('contentinfo');
    expect(footer).toBeInTheDocument();
  });
});
