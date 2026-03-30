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

import type {
  AvailableModel,
  SubscriptionTier,
} from '@/features/ai/types/model.types';
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
    inputCostPerMillion: 3,
    outputCostPerMillion: 15,
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
  user: ReturnType<typeof userEvent.setup>
): Promise<void> {
  await user.click(
    screen.getByRole('combobox', { name: /preferred ai model/i })
  );
  await user.click(
    screen.getByRole('option', { name: new RegExp(FIRST_FREE_MODEL.name, 'i') })
  );
}

let ModelSelector: typeof import('@/app/settings/ai/components/model-selector').ModelSelector;

// Mock scrollIntoView which is not available in jsdom
window.HTMLElement.prototype.scrollIntoView = vi.fn();

describe('ModelSelector', () => {
  beforeAll(async () => {
    ({ ModelSelector } = await import(
      '@/app/settings/ai/components/model-selector'
    ));
  });

  beforeEach(() => {
    defaultOnSave.mockReset();
    defaultOnSave.mockResolvedValue(undefined);
  });

  afterAll(() => {
    vi.resetModules();
  });

  describe('Rendering', () => {
    it('renders with no current model selected', () => {
      render(
        <ModelSelector
          currentModel={null}
          userTier="free"
          availableModels={MODELS_BY_TIER.free}
          onSave={defaultOnSave}
        />
      );

      expect(screen.getByLabelText(/preferred ai model/i)).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /save preferences/i })
      ).toBeDisabled();
    });

    it('renders with a current model selected', () => {
      render(
        <ModelSelector
          currentModel={FIRST_FREE_MODEL.id}
          userTier="free"
          availableModels={MODELS_BY_TIER.free}
          onSave={defaultOnSave}
        />
      );

      expect(screen.getByLabelText(/preferred ai model/i)).toBeInTheDocument();
    });

    it('displays model details card when a model is selected', () => {
      render(
        <ModelSelector
          currentModel={FIRST_FREE_MODEL.id}
          userTier="free"
          availableModels={MODELS_BY_TIER.free}
          onSave={defaultOnSave}
        />
      );

      // Should show model details - use getAllBy for elements that may appear multiple times
      const contextWindowLabels = screen.getAllByText(/context window/i);
      expect(contextWindowLabels.length).toBeGreaterThan(0);

      expect(screen.getByText(/max output/i)).toBeInTheDocument();
      expect(screen.getByText(/input cost/i)).toBeInTheDocument();
      expect(screen.getByText(/output cost/i)).toBeInTheDocument();
    });

    it('displays upgrade prompt for non-pro users', () => {
      render(
        <ModelSelector
          currentModel={null}
          userTier="free"
          availableModels={MODELS_BY_TIER.free}
          onSave={defaultOnSave}
        />
      );

      expect(screen.getByText(/unlock premium models/i)).toBeInTheDocument();
      // Use getAllBy since "upgrade to pro" appears in both button and description
      const upgradeElements = screen.getAllByText(/upgrade to pro/i);
      expect(upgradeElements.length).toBeGreaterThan(0);
    });

    it('does not display upgrade prompt for pro users', () => {
      render(
        <ModelSelector
          currentModel={null}
          userTier="pro"
          availableModels={MODELS_BY_TIER.pro}
          onSave={defaultOnSave}
        />
      );

      expect(
        screen.queryByText(/unlock premium models/i)
      ).not.toBeInTheDocument();
    });
  });

  describe('Model Selection', () => {
    it('shows model description when selected', () => {
      render(
        <ModelSelector
          currentModel={FIRST_FREE_MODEL.id}
          userTier="free"
          availableModels={MODELS_BY_TIER.free}
          onSave={defaultOnSave}
        />
      );

      expect(
        screen.getByText(FIRST_FREE_MODEL.description)
      ).toBeInTheDocument();
    });

    it('displays correct model name', () => {
      render(
        <ModelSelector
          currentModel={FIRST_FREE_MODEL.id}
          userTier="free"
          availableModels={MODELS_BY_TIER.free}
          onSave={defaultOnSave}
        />
      );

      // The model name appears multiple times (trigger and card)
      const modelNames = screen.getAllByText(FIRST_FREE_MODEL.name);
      expect(modelNames.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Save Button', () => {
    it('save button is disabled when no changes made', () => {
      render(
        <ModelSelector
          currentModel={FIRST_FREE_MODEL.id}
          userTier="free"
          availableModels={MODELS_BY_TIER.free}
          onSave={defaultOnSave}
        />
      );

      const saveButton = screen.getByRole('button', {
        name: /save preferences/i,
      });
      expect(saveButton).toBeDisabled();
    });

    it('renders save button', () => {
      render(
        <ModelSelector
          currentModel={FIRST_FREE_MODEL.id}
          userTier="free"
          availableModels={MODELS_BY_TIER.free}
          onSave={defaultOnSave}
        />
      );

      const saveButton = screen.getByRole('button', {
        name: /save preferences/i,
      });
      expect(saveButton).toBeInTheDocument();
    });

    it('does not enable save until the user selects a model', async () => {
      const user = userEvent.setup();
      render(
        <ModelSelector
          currentModel={null}
          userTier="free"
          availableModels={MODELS_BY_TIER.free}
          onSave={defaultOnSave}
        />
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
        />
      );

      await selectFirstFreeModel(user);

      const saveButton = screen.getByRole('button', {
        name: /save preferences/i,
      });
      await user.click(saveButton);

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
        />
      );

      await user.click(
        screen.getByRole('button', { name: /use tier default/i })
      );

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith(null);
      });
    });

    it('keeps save disabled immediately after a successful save', async () => {
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
        />
      );

      await selectFirstFreeModel(user);
      const saveButton = screen.getByRole('button', {
        name: /save preferences/i,
      });
      await user.click(saveButton);

      await waitFor(() => {
        expect(
          screen.getByText(/preferences saved successfully/i)
        ).toBeInTheDocument();
      });

      expect(saveButton).toBeDisabled();
    });

    it('shows saving state while save is in progress', async () => {
      const mockOnSave = vi.fn<(modelId: string | null) => Promise<void>>(
        () => new Promise<void>((resolve) => setTimeout(resolve, 100))
      );
      const user = userEvent.setup();

      render(
        <ModelSelector
          currentModel={null}
          userTier="free"
          availableModels={MODELS_BY_TIER.free}
          onSave={mockOnSave}
        />
      );

      await selectFirstFreeModel(user);

      const saveButton = screen.getByRole('button', {
        name: /save preferences/i,
      });
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/saving/i)).toBeInTheDocument();
      });
    });

    it('shows success message after save', async () => {
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
        />
      );

      await selectFirstFreeModel(user);

      const saveButton = screen.getByRole('button', {
        name: /save preferences/i,
      });
      await user.click(saveButton);

      await waitFor(() => {
        expect(
          screen.getByText(/preferences saved successfully/i)
        ).toBeInTheDocument();
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
        />
      );

      await selectFirstFreeModel(user);

      const saveButton = screen.getByRole('button', {
        name: /save preferences/i,
      });
      await user.click(saveButton);

      await waitFor(() => {
        expect(
          screen.getByText(/failed to save preferences/i)
        ).toBeInTheDocument();
      });
    });
  });

  describe('Tier Gating', () => {
    it('renders correctly for free tier user', () => {
      render(
        <ModelSelector
          currentModel={FIRST_FREE_MODEL.id}
          userTier="free"
          availableModels={MODELS_BY_TIER.free}
          onSave={defaultOnSave}
        />
      );

      expect(screen.getByLabelText(/preferred ai model/i)).toBeInTheDocument();
    });

    it('renders correctly for pro tier user', () => {
      render(
        <ModelSelector
          currentModel={FIRST_FREE_MODEL.id}
          userTier="pro"
          availableModels={MODELS_BY_TIER.pro}
          onSave={defaultOnSave}
        />
      );

      expect(screen.getByLabelText(/preferred ai model/i)).toBeInTheDocument();
      // Pro users should not see upgrade prompt
      expect(
        screen.queryByText(/unlock premium models/i)
      ).not.toBeInTheDocument();
    });
  });

  describe('Tier Badge Display', () => {
    it('displays tier badge on selected model card', () => {
      render(
        <ModelSelector
          currentModel={FIRST_FREE_MODEL.id}
          userTier="free"
          availableModels={MODELS_BY_TIER.free}
          onSave={defaultOnSave}
        />
      );

      // The selected model card should show a FREE badge
      const badges = screen.getAllByText(/FREE/i);
      expect(badges.length).toBeGreaterThan(0);
    });
  });

  describe('Model Details Display', () => {
    it('displays context window for selected model', () => {
      render(
        <ModelSelector
          currentModel={FIRST_FREE_MODEL.id}
          userTier="free"
          availableModels={MODELS_BY_TIER.free}
          onSave={defaultOnSave}
        />
      );

      // Check for context window display (should show as "XK tokens")
      const contextLabels = screen.getAllByText(/context window/i);
      expect(contextLabels.length).toBeGreaterThan(0);
      // There are multiple token displays (context window and max output)
      const tokenTexts = screen.getAllByText(/tokens/i);
      expect(tokenTexts.length).toBeGreaterThan(0);
    });

    it('displays cost information for selected model', () => {
      render(
        <ModelSelector
          currentModel={FIRST_FREE_MODEL.id}
          userTier="free"
          availableModels={MODELS_BY_TIER.free}
          onSave={defaultOnSave}
        />
      );

      // Free models should show "Free" for costs
      const freeTexts = screen.getAllByText(/free/i);
      expect(freeTexts.length).toBeGreaterThan(0);
    });

    it('displays provider name for selected model', () => {
      render(
        <ModelSelector
          currentModel={FIRST_FREE_MODEL.id}
          userTier="free"
          availableModels={MODELS_BY_TIER.free}
          onSave={defaultOnSave}
        />
      );

      // Should show provider name (e.g. "by OpenRouter")
      expect(
        screen.getByText(
          (_content, element) =>
            element?.textContent?.trim() === `by ${FIRST_FREE_MODEL.provider}`
        )
      ).toBeInTheDocument();
    });
  });
});
