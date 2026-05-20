import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import '../../mocks/unit/client-logger.unit';
import '../../mocks/unit/sonner.unit';

import type { AvailableModel } from '@/features/ai/types/model.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';
import { createTestModel } from '../../fixtures/model.factory';

const FREE_MODELS: AvailableModel[] = [
  createTestModel({
    id: 'test-free-model-1',
    name: 'Test Free Model 1',
  }),
  createTestModel({
    id: 'test-free-model-2',
    name: 'Test Free Model 2',
    provider: 'Backup Provider',
  }),
];
const FIRST_FREE_MODEL = FREE_MODELS[0];
const PRO_MODELS: AvailableModel[] = [
  ...FREE_MODELS,
  createTestModel({
    id: 'test-pro-model-1',
    name: 'Test Pro Model 1',
    tier: 'pro',
  }),
];
const MODELS_BY_TIER: Record<SubscriptionTier, AvailableModel[]> = {
  free: FREE_MODELS,
  starter: FREE_MODELS,
  pro: PRO_MODELS,
};

const defaultOnSave = vi
  .fn<(modelId: string | null) => Promise<void>>()
  .mockResolvedValue(undefined);

async function selectFirstFreeModel(
  user: ReturnType<typeof userEvent.setup>,
): Promise<void> {
  await user.click(
    screen.getByRole('combobox', { name: /preferred ai model/i }),
  );
  await user.click(
    screen.getByRole('option', {
      name: new RegExp(FIRST_FREE_MODEL.name, 'i'),
    }),
  );
}

let ModelSelector: typeof import('@/app/(app)/settings/ai/components/model-selector').ModelSelector;

window.HTMLElement.prototype.scrollIntoView = vi.fn();

describe('ModelSelector', () => {
  beforeAll(async () => {
    ({ ModelSelector } =
      await import('@/app/(app)/settings/ai/components/model-selector'));
  });

  beforeEach(() => {
    defaultOnSave.mockReset();
    defaultOnSave.mockResolvedValue(undefined);
  });

  afterAll(() => {
    vi.resetModules();
  });

  it('displays upgrade prompt for non-pro users', () => {
    render(
      <ModelSelector
        currentModel={null}
        userTier="free"
        availableModels={MODELS_BY_TIER.free}
        onSave={defaultOnSave}
      />,
    );

    expect(screen.getByText(/unlock premium models/i)).toBeInTheDocument();
  });

  it('does not display upgrade prompt for pro users', () => {
    render(
      <ModelSelector
        currentModel={null}
        userTier="pro"
        availableModels={MODELS_BY_TIER.pro}
        onSave={defaultOnSave}
      />,
    );

    expect(
      screen.queryByText(/unlock premium models/i),
    ).not.toBeInTheDocument();
  });

  it('save button is disabled when no changes made', () => {
    render(
      <ModelSelector
        currentModel={FIRST_FREE_MODEL.id}
        userTier="free"
        availableModels={MODELS_BY_TIER.free}
        onSave={defaultOnSave}
      />,
    );

    expect(
      screen.getByRole('button', { name: /save preferences/i }),
    ).toBeDisabled();
  });

  it('does not enable save until the user selects a model', async () => {
    const user = userEvent.setup();
    render(
      <ModelSelector
        currentModel={null}
        userTier="free"
        availableModels={MODELS_BY_TIER.free}
        onSave={defaultOnSave}
      />,
    );

    const saveButton = screen.getByRole('button', {
      name: /save preferences/i,
    });
    expect(saveButton).toBeDisabled();

    await selectFirstFreeModel(user);

    await waitFor(() => {
      expect(saveButton).not.toBeDisabled();
    });
  });

  it('calls onSave with model when save is triggered after selection', async () => {
    const mockOnSave = vi
      .fn<(modelId: string | null) => Promise<void>>()
      .mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <ModelSelector
        currentModel={null}
        userTier="free"
        availableModels={MODELS_BY_TIER.free}
        onSave={mockOnSave}
      />,
    );

    await selectFirstFreeModel(user);
    await user.click(screen.getByRole('button', { name: /save preferences/i }));

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith(FIRST_FREE_MODEL.id);
    });
  });

  it('calls onSave with null when Use tier default clears a saved preference', async () => {
    const mockOnSave = vi
      .fn<(modelId: string | null) => Promise<void>>()
      .mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <ModelSelector
        currentModel={FIRST_FREE_MODEL.id}
        userTier="free"
        availableModels={MODELS_BY_TIER.free}
        onSave={mockOnSave}
      />,
    );

    await user.click(screen.getByRole('button', { name: /use tier default/i }));

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith(null);
    });
  });

  it('keeps save disabled immediately after a successful save', async () => {
    const user = userEvent.setup();

    render(
      <ModelSelector
        currentModel={null}
        userTier="free"
        availableModels={MODELS_BY_TIER.free}
        onSave={defaultOnSave}
      />,
    );

    await selectFirstFreeModel(user);
    const saveButton = screen.getByRole('button', {
      name: /save preferences/i,
    });
    await user.click(saveButton);

    await waitFor(() => {
      expect(
        screen.getByText(/preferences saved successfully/i),
      ).toBeInTheDocument();
    });

    expect(saveButton).toBeDisabled();
  });

  it('shows saving state while save is in progress', async () => {
    const mockOnSave = vi.fn<(modelId: string | null) => Promise<void>>(
      () => new Promise<void>((resolve) => setTimeout(resolve, 100)),
    );
    const user = userEvent.setup();

    render(
      <ModelSelector
        currentModel={null}
        userTier="free"
        availableModels={MODELS_BY_TIER.free}
        onSave={mockOnSave}
      />,
    );

    await selectFirstFreeModel(user);
    await user.click(screen.getByRole('button', { name: /save preferences/i }));

    await waitFor(() => {
      expect(screen.getByText(/saving/i)).toBeInTheDocument();
    });
  });

  it('shows error message when save fails', async () => {
    const mockOnSave = vi
      .fn<(modelId: string | null) => Promise<void>>()
      .mockRejectedValue(new Error('Save failed'));
    const user = userEvent.setup();

    render(
      <ModelSelector
        currentModel={null}
        userTier="free"
        availableModels={MODELS_BY_TIER.free}
        onSave={mockOnSave}
      />,
    );

    await selectFirstFreeModel(user);
    await user.click(screen.getByRole('button', { name: /save preferences/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/failed to save preferences/i),
      ).toBeInTheDocument();
    });
  });
});
