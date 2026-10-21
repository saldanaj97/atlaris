import { render, screen } from '@testing-library/react';
import { buildUserFixture } from '@tests/fixtures/users';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  redirectMock: vi.fn(),
  requestBoundaryComponentMock: vi.fn(),
  refreshMock: vi.fn(),
  isGroundedEnabledMock: vi.fn(),
  getGroundedModelPreferencesMock: vi.fn(),
}));

vi.mock('@/features/ai/grounded-generation-flag', () => ({
  isGroundedEnabled: mocks.isGroundedEnabledMock,
}));

vi.mock('@/lib/db/queries/user-preferences', () => ({
  getGroundedModelPreferences: mocks.getGroundedModelPreferencesMock,
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
    mocks.isGroundedEnabledMock.mockResolvedValue(false);
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

  it('adds writer, verifier, and advisor pickers for Pro when grounded generation is on', async () => {
    mocks.isGroundedEnabledMock.mockResolvedValue(true);
    mocks.getGroundedModelPreferencesMock.mockResolvedValue({
      preferredWriterAiModel: 'anthropic/claude-haiku-5.5',
      preferredVerifierAiModel: 'not/in-catalog',
      preferredAdvisorAiModel: null,
    });
    mocks.requestBoundaryComponentMock.mockImplementation(async (run) =>
      run({
        actor: buildUserFixture({ subscriptionTier: 'pro' }),
        db: {} as never,
      }),
    );

    await renderCard();

    expect(mocks.isGroundedEnabledMock).toHaveBeenCalledWith('pro');
    expect(screen.getAllByRole('combobox')).toHaveLength(6);
    expect(
      screen.getByRole('combobox', { name: /writer model/i }),
    ).toHaveTextContent('anthropic/claude-haiku-5.5');
    expect(
      screen.getByRole('combobox', { name: /verifier model/i }),
    ).toHaveTextContent(/^Default/);
    expect(
      screen.getByRole('combobox', { name: /advisor model/i }),
    ).toHaveTextContent(/^Default/);
  });

  it('keeps the grounded pickers hidden and unloaded for Starter even when the flag covers it', async () => {
    mocks.isGroundedEnabledMock.mockResolvedValue(true);
    mocks.requestBoundaryComponentMock.mockImplementation(async (run) =>
      run({
        actor: buildUserFixture({ subscriptionTier: 'starter' }),
        db: {} as never,
      }),
    );

    await renderCard();

    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    expect(mocks.getGroundedModelPreferencesMock).not.toHaveBeenCalled();
  });

  it('does not load grounded picks for Pro while the flag is off', async () => {
    mocks.requestBoundaryComponentMock.mockImplementation(async (run) =>
      run({
        actor: buildUserFixture({ subscriptionTier: 'pro' }),
        db: {} as never,
      }),
    );

    await renderCard();

    expect(screen.getAllByRole('combobox')).toHaveLength(3);
    expect(mocks.getGroundedModelPreferencesMock).not.toHaveBeenCalled();
  });
});
