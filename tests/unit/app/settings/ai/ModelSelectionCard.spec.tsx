import { render, screen } from '@testing-library/react';
import { buildUserFixture } from '@tests/fixtures/users';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  redirectMock: vi.fn(),
  requestBoundaryComponentMock: vi.fn(),
  refreshMock: vi.fn(),
}));

vi.mock('@/lib/api/request-boundary', () => ({
  requestBoundary: {
    component: mocks.requestBoundaryComponentMock,
  },
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirectMock,
  useRouter: () => ({ refresh: mocks.refreshMock }),
}));

vi.mock('@/lib/logging/client', () => ({
  clientLogger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

window.HTMLElement.prototype.scrollIntoView = vi.fn();

async function renderCard() {
  const { ModelSelectionCard } =
    await import('@/app/(app)/settings/ai/components/ModelSelectionCard');
  render(await ModelSelectionCard());
}

describe('ModelSelectionCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render a model picker for Free', async () => {
    mocks.requestBoundaryComponentMock.mockImplementation(async (run) =>
      run({
        actor: buildUserFixture({ subscriptionTier: 'free' }),
        db: {} as never,
      }),
    );

    await renderCard();

    expect(screen.getByText(/no model picker on free/i)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /save preferences/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /use tier default/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /view pricing plans/i }),
    ).toBeInTheDocument();
  });

  it('renders one outline picker for Starter', async () => {
    mocks.requestBoundaryComponentMock.mockImplementation(async (run) =>
      run({
        actor: buildUserFixture({ subscriptionTier: 'starter' }),
        db: {} as never,
      }),
    );

    await renderCard();

    expect(
      screen.getByRole('combobox', { name: /preferred ai model/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
  });

  it('renders outline, regeneration, and lesson pickers for Pro', async () => {
    mocks.requestBoundaryComponentMock.mockImplementation(async (run) =>
      run({
        actor: buildUserFixture({ subscriptionTier: 'pro' }),
        db: {} as never,
      }),
    );

    await renderCard();

    expect(
      screen.getByRole('combobox', { name: /preferred outline model/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: /preferred regeneration model/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: /preferred lesson model/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('combobox')).toHaveLength(3);
  });
});
