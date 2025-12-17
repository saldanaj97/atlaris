import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../mocks/unit/client-logger.unit';
import '../../mocks/unit/sonner.unit';

import { ModelSelector } from '@/components/settings/model-selector';
import { AVAILABLE_MODELS } from '@/lib/ai/ai-models';

// Get test data
const FREE_MODELS = AVAILABLE_MODELS.filter((m) => m.tier === 'free');
const FIRST_FREE_MODEL = FREE_MODELS[0];

// Mock scrollIntoView which is not available in jsdom
window.HTMLElement.prototype.scrollIntoView = vi.fn();

describe('ModelSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('renders with no current model selected', () => {
      render(<ModelSelector currentModel={null} userTier="free" />);

      expect(screen.getByLabelText(/preferred ai model/i)).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /save preferences/i })
      ).toBeInTheDocument();
    });

    it('renders with a current model selected', () => {
      render(
        <ModelSelector
          currentModel="google/gemini-2.0-flash-exp:free"
          userTier="free"
        />
      );

      expect(screen.getByLabelText(/preferred ai model/i)).toBeInTheDocument();
    });

    it('displays model details card when a model is selected', () => {
      render(
        <ModelSelector
          currentModel="google/gemini-2.0-flash-exp:free"
          userTier="free"
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
      render(<ModelSelector currentModel={null} userTier="free" />);

      expect(screen.getByText(/unlock premium models/i)).toBeInTheDocument();
      // Use getAllBy since "upgrade to pro" appears in both button and description
      const upgradeElements = screen.getAllByText(/upgrade to pro/i);
      expect(upgradeElements.length).toBeGreaterThan(0);
    });

    it('does not display upgrade prompt for pro users', () => {
      render(<ModelSelector currentModel={null} userTier="pro" />);

      expect(
        screen.queryByText(/unlock premium models/i)
      ).not.toBeInTheDocument();
    });
  });

  describe('Model Selection', () => {
    it('shows model description when selected', () => {
      render(
        <ModelSelector
          currentModel="google/gemini-2.0-flash-exp:free"
          userTier="free"
        />
      );

      const model = AVAILABLE_MODELS.find(
        (m) => m.id === 'google/gemini-2.0-flash-exp:free'
      );
      if (model) {
        expect(screen.getByText(model.description)).toBeInTheDocument();
      }
    });

    it('displays correct model name', () => {
      render(
        <ModelSelector
          currentModel="google/gemini-2.0-flash-exp:free"
          userTier="free"
        />
      );

      // The model name appears multiple times (trigger and card)
      const modelNames = screen.getAllByText('Gemini 2.0 Flash');
      expect(modelNames.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Save Button', () => {
    it('save button is disabled when no changes made', () => {
      render(
        <ModelSelector
          currentModel="google/gemini-2.0-flash-exp:free"
          userTier="free"
        />
      );

      const saveButton = screen.getByRole('button', {
        name: /save preferences/i,
      });
      expect(saveButton).toBeDisabled();
    });

    it('renders save button', () => {
      render(
        <ModelSelector currentModel={FIRST_FREE_MODEL.id} userTier="free" />
      );

      const saveButton = screen.getByRole('button', {
        name: /save preferences/i,
      });
      expect(saveButton).toBeInTheDocument();
    });

    it('calls onSave with model when save is triggered', async () => {
      const mockOnSave = vi
        .fn<(modelId: string) => Promise<void>>()
        .mockResolvedValue(undefined);

      // Render with no current model so the initial selection counts as a change
      render(
        <ModelSelector
          currentModel={null}
          userTier="free"
          onSave={mockOnSave}
        />
      );

      // The component defaults to selecting the first model, which is different from null
      const saveButton = screen.getByRole('button', {
        name: /save preferences/i,
      });

      // Since currentModel is null and default selection is FIRST_FREE_MODEL, there's a change
      await waitFor(() => {
        expect(saveButton).not.toBeDisabled();
      });

      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith(FIRST_FREE_MODEL.id);
      });
    });

    it('shows saving state while save is in progress', async () => {
      const mockOnSave = vi.fn<(modelId: string) => Promise<void>>(
        () => new Promise<void>((resolve) => setTimeout(resolve, 100))
      );

      render(
        <ModelSelector
          currentModel={null}
          userTier="free"
          onSave={mockOnSave}
        />
      );

      const saveButton = screen.getByRole('button', {
        name: /save preferences/i,
      });

      await waitFor(() => {
        expect(saveButton).not.toBeDisabled();
      });

      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/saving/i)).toBeInTheDocument();
      });
    });

    it('shows success message after save', async () => {
      const mockOnSave = vi
        .fn<(modelId: string) => Promise<void>>()
        .mockResolvedValue(undefined);

      render(
        <ModelSelector
          currentModel={null}
          userTier="free"
          onSave={mockOnSave}
        />
      );

      const saveButton = screen.getByRole('button', {
        name: /save preferences/i,
      });

      await waitFor(() => {
        expect(saveButton).not.toBeDisabled();
      });

      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(
          screen.getByText(/preferences saved successfully/i)
        ).toBeInTheDocument();
      });
    });

    it('shows error message when save fails', async () => {
      const mockOnSave = vi
        .fn<(modelId: string) => Promise<void>>()
        .mockRejectedValue(new Error('Save failed'));

      render(
        <ModelSelector
          currentModel={null}
          userTier="free"
          onSave={mockOnSave}
        />
      );

      const saveButton = screen.getByRole('button', {
        name: /save preferences/i,
      });

      await waitFor(() => {
        expect(saveButton).not.toBeDisabled();
      });

      fireEvent.click(saveButton);

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
        <ModelSelector currentModel={FIRST_FREE_MODEL.id} userTier="free" />
      );

      expect(screen.getByLabelText(/preferred ai model/i)).toBeInTheDocument();
    });

    it('renders correctly for pro tier user', () => {
      render(
        <ModelSelector currentModel={FIRST_FREE_MODEL.id} userTier="pro" />
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
          currentModel="google/gemini-2.0-flash-exp:free"
          userTier="free"
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
          currentModel="google/gemini-2.0-flash-exp:free"
          userTier="free"
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
          currentModel="google/gemini-2.0-flash-exp:free"
          userTier="free"
        />
      );

      // Free models should show "Free" for costs
      const freeTexts = screen.getAllByText(/free/i);
      expect(freeTexts.length).toBeGreaterThan(0);
    });

    it('displays provider name for selected model', () => {
      render(
        <ModelSelector
          currentModel="google/gemini-2.0-flash-exp:free"
          userTier="free"
        />
      );

      // Should show "by Google" for Gemini model
      expect(screen.getByText(/google/i)).toBeInTheDocument();
    });
  });
});
