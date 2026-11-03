import type { AvailableModel } from '@/features/ai/types/model.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import { createTestModel } from '../../fixtures/model.factory';
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
const PRO_ONLY_MODELS: AvailableModel[] = [
  createTestModel({
    id: 'test-pro-only-model-1',
    name: 'Test Pro Only Model 1',
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

  it('shows empty upgrade copy without a picker when no models are available', () => {
    render(
      <ModelSelector
        currentModel={null}
        userTier='free'
        availableModels={[]}
        onSave={defaultOnSave}
      />,
    );

    expect(
      screen.queryByRole('combobox', { name: /preferred ai model/i }),
    ).not.toBeInTheDocument();
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

  it('displays upgrade prompt for non-pro users', () => {
    render(
      <ModelSelector
        currentModel={null}
        userTier='free'
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
        userTier='pro'
        availableModels={MODELS_BY_TIER.pro}
        onSave={defaultOnSave}
      />,
    );

    expect(
      screen.queryByText(/unlock premium models/i),
    ).not.toBeInTheDocument();
  });

  it('renders Pro-only models disabled with a Pro plan badge and keeps them unselectable', async () => {
    const user = userEvent.setup();
    render(
      <ModelSelector
        currentModel={null}
        userTier='starter'
        availableModels={MODELS_BY_TIER.starter}
        proOnlyModels={PRO_ONLY_MODELS}
        onSave={defaultOnSave}
      />,
    );

    const trigger = screen.getByRole('combobox', {
      name: /preferred ai model/i,
    });
    expect(trigger).toHaveAccessibleDescription(
      /models marked pro plan are available when you upgrade to pro/i,
    );

    await user.click(trigger);
    const proOnlyOption = screen.getByRole('option', {
      name: /test pro only model 1/i,
    });
    expect(proOnlyOption).toHaveAttribute('aria-disabled', 'true');
    expect(proOnlyOption).toHaveTextContent(/pro plan/i);
    expect(proOnlyOption).not.toHaveTextContent(/\bPRO\b/);
    expect(
      screen.getByRole('group', {
        name: /upgrade to pro to use these models/i,
      }),
    ).toContainElement(proOnlyOption);
    expect(
      screen.getByRole('option', { name: /test free model 1/i }),
    ).not.toHaveAttribute('aria-disabled');

    await user.click(proOnlyOption);
    await user.keyboard('{Escape}');

    expect(trigger).toHaveTextContent(/select a model/i);
    expect(
      screen.getByRole('button', { name: /save preferences/i }),
    ).toBeDisabled();
  });

  it('shows no Pro plan rows or hint without Pro-only models', async () => {
    const user = userEvent.setup();
    render(
      <ModelSelector
        currentModel={null}
        userTier='pro'
        availableModels={MODELS_BY_TIER.pro}
        onSave={defaultOnSave}
      />,
    );

    const trigger = screen.getByRole('combobox', {
      name: /preferred ai model/i,
    });
    expect(trigger).not.toHaveAttribute('aria-describedby');

    await user.click(trigger);
    expect(screen.queryByText(/pro plan/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    for (const option of screen.getAllByRole('option')) {
      expect(option).not.toHaveAttribute('aria-disabled');
    }
  });

  it('shows the placeholder without a placeholder option when no model is selected', async () => {
    const user = userEvent.setup();
    render(
      <ModelSelector
        currentModel={null}
        userTier='starter'
        availableModels={MODELS_BY_TIER.starter}
        onSave={defaultOnSave}
      />,
    );

    const trigger = screen.getByRole('combobox', {
      name: /preferred ai model/i,
    });
    expect(trigger).toHaveAttribute('data-placeholder');
    expect(trigger).toHaveTextContent(/select a model/i);

    await user.click(trigger);
    expect(
      screen.queryByRole('option', { name: /select a model/i }),
    ).not.toBeInTheDocument();
    for (const option of screen.getAllByRole('option')) {
      expect(option).not.toHaveAttribute('aria-selected', 'true');
    }
  });

  it('returns the trigger to the placeholder after Clear selection', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const user = userEvent.setup();
    render(
      <ModelSelector
        currentModel={null}
        userTier='starter'
        availableModels={MODELS_BY_TIER.starter}
        onSave={defaultOnSave}
      />,
    );

    await selectFirstFreeModel(user);
    const trigger = screen.getByRole('combobox', {
      name: /preferred ai model/i,
    });
    expect(trigger).not.toHaveAttribute('data-placeholder');
    expect(trigger).toHaveTextContent(FIRST_FREE_MODEL.name);

    await user.click(screen.getByRole('button', { name: /clear selection/i }));

    expect(trigger).toHaveAttribute('data-placeholder');
    expect(trigger).toHaveTextContent(/select a model/i);
    await user.click(trigger);
    for (const option of screen.getAllByRole('option')) {
      expect(option).not.toHaveAttribute('aria-selected', 'true');
    }
    expect(
      consoleError.mock.calls.filter(([message]) =>
        /uncontrolled|controlled/i.test(String(message)),
      ),
    ).toEqual([]);
    consoleError.mockRestore();
  });

  it('returns the trigger to the placeholder after Use tier default', async () => {
    const user = userEvent.setup();
    render(
      <ModelSelector
        currentModel={FIRST_FREE_MODEL.id}
        userTier='starter'
        availableModels={MODELS_BY_TIER.starter}
        onSave={defaultOnSave}
      />,
    );

    const trigger = screen.getByRole('combobox', {
      name: /preferred ai model/i,
    });
    expect(trigger).toHaveTextContent(FIRST_FREE_MODEL.name);

    await user.click(screen.getByRole('button', { name: /use tier default/i }));

    await waitFor(() => {
      expect(trigger).toHaveAttribute('data-placeholder');
    });
    expect(trigger).toHaveTextContent(/select a model/i);
  });

  it('labels model prices Free or Paid on rows and the detail card', async () => {
    const user = userEvent.setup();
    const paidModel = PRO_MODELS[PRO_MODELS.length - 1];
    render(
      <ModelSelector
        currentModel={paidModel.id}
        userTier='pro'
        availableModels={MODELS_BY_TIER.pro}
        onSave={defaultOnSave}
      />,
    );

    const detailBadge = () =>
      screen
        .getByRole('heading', { level: 3 })
        .closest('[data-slot="card"]')
        ?.querySelector('[data-slot="badge"]');
    expect(detailBadge()).toHaveTextContent(/^Paid$/);

    await user.click(
      screen.getByRole('combobox', { name: /preferred ai model/i }),
    );
    expect(
      screen.getByRole('option', { name: /test pro model 1/i }),
    ).toHaveTextContent(/Paid$/);
    expect(
      screen.getByRole('option', { name: /test free model 1/i }),
    ).toHaveTextContent(/Free$/);
    for (const option of screen.getAllByRole('option')) {
      expect(option).not.toHaveTextContent(/\bPRO\b|\bFREE\b/);
    }

    await user.click(
      screen.getByRole('option', { name: /test free model 1/i }),
    );
    expect(detailBadge()).toHaveTextContent(/^Free$/);
  });

  it('shows max output only when the catalog reports it', () => {
    const { maxOutputTokens: _maxOutputTokens, ...unknownOutputModel } =
      createTestModel({
        id: 'test-unknown-output-model',
        name: 'Test Unknown Output Model',
        contextWindow: 200_000,
      });
    render(
      <ModelSelector
        currentModel={unknownOutputModel.id}
        userTier='free'
        availableModels={[unknownOutputModel]}
        onSave={defaultOnSave}
      />,
    );

    const maxOutput = screen.getByText('Max output').nextElementSibling;
    expect(maxOutput).toHaveTextContent(/^—$/);
    expect(screen.getByText('200K tokens')).toBeInTheDocument();
    expect(screen.queryByText('100K tokens')).not.toBeInTheDocument();
  });

  it('save button is disabled when no changes made', () => {
    render(
      <ModelSelector
        currentModel={FIRST_FREE_MODEL.id}
        userTier='free'
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
        userTier='free'
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
        userTier='free'
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
        userTier='free'
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
        userTier='free'
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
        userTier='free'
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
        userTier='free'
        availableModels={MODELS_BY_TIER.free}
        onSave={mockOnSave}
      />,
    );

    await selectFirstFreeModel(user);
    const saveButton = screen.getByRole('button', {
      name: /save preferences/i,
    });
    await user.click(saveButton);

    await waitFor(() => {
      expect(
        screen.getByText(/failed to save preferences/i),
      ).toBeInTheDocument();
      expect(saveButton).not.toBeDisabled();
    });
  });
});
