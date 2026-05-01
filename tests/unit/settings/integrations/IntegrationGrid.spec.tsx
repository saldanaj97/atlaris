import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IntegrationGrid } from '@/app/(app)/settings/integrations/components/IntegrationGrid';

describe('IntegrationGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders all four integration cards', () => {
    render(<IntegrationGrid />);

    expect(
      screen.getByRole('region', { name: 'Google Calendar' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Slack' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Todoist' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Zapier' })).toBeInTheDocument();
  });

  it('shows Google Calendar as coming soon', () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response());

    render(<IntegrationGrid />);

    const googleCard = screen.getByRole('region', { name: 'Google Calendar' });

    expect(
      within(googleCard).getByRole('status', { name: 'Coming Soon' }),
    ).toBeInTheDocument();
    expect(
      within(googleCard).getByRole('button', { name: 'Coming Soon' }),
    ).toBeDisabled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
