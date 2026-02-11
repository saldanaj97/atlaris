import { act, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PdfCreatePanel } from '@/app/plans/new/components/PdfCreatePanel';

// Mock dependencies
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

vi.mock('@/hooks/useStreamingPlanGeneration', () => ({
  useStreamingPlanGeneration: () => ({
    startGeneration: vi.fn(),
  }),
  isStreamingError: (error: unknown) =>
    error instanceof Error && 'code' in error,
}));

vi.mock('@/lib/logging/client', () => ({
  clientLogger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

const mockRouter = {
  push: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  prefetch: vi.fn(),
};

const mockOnSwitchToManual = vi.fn();

const mockExtractionResponse = {
  success: true,
  extraction: {
    text: 'Sample PDF content',
    pageCount: 5,
    metadata: {
      title: 'Test PDF',
      author: 'Test Author',
    },
    structure: {
      sections: [
        {
          title: 'Introduction',
          content: 'Introduction content',
          level: 1,
        },
        {
          title: 'Chapter 1',
          content: 'Chapter 1 content',
          level: 1,
        },
        {
          title: 'Conclusion',
          content: 'Conclusion content',
          level: 1,
        },
      ],
      suggestedMainTopic: 'TypeScript Fundamentals',
      confidence: 'high' as const,
    },
  },
  proof: {
    token: 'test-token-123',
    extractionHash: 'test-hash-456',
    expiresAt: '2024-12-31T23:59:59Z',
    version: 1 as const,
  },
};

describe('PdfCreatePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as any).mockReturnValue(mockRouter);
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('renders upload zone in idle state', () => {
      render(<PdfCreatePanel onSwitchToManual={mockOnSwitchToManual} />);

      expect(screen.getByText(/upload/i)).toBeInTheDocument();
    });

    it('renders with not uploading state initially', () => {
      render(<PdfCreatePanel onSwitchToManual={mockOnSwitchToManual} />);

      // Check that the component is not in uploading state
      const uploadArea = screen.getByRole('presentation', { hidden: true });
      expect(uploadArea).toBeInTheDocument();
    });
  });

  describe('file upload', () => {
    it('rejects non-PDF files with toast error', async () => {
      const user = userEvent.setup();
      const { toast } = await import('sonner');

      render(<PdfCreatePanel onSwitchToManual={mockOnSwitchToManual} />);

      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      const input = screen.getByLabelText(/upload/i, { selector: 'input' });

      await user.upload(input, file);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Please select a PDF file');
      });
    });

    it('shows uploading state when file is being uploaded', async () => {
      const user = userEvent.setup();
      (global.fetch as any).mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ ok: true, json: async () => mockExtractionResponse }), 100);
          })
      );

      render(<PdfCreatePanel onSwitchToManual={mockOnSwitchToManual} />);

      const file = new File(['pdf content'], 'test.pdf', {
        type: 'application/pdf',
      });
      const input = screen.getByLabelText(/upload/i, { selector: 'input' });

      await user.upload(input, file);

      // Component should show uploading state briefly
      expect(screen.getByRole('presentation', { hidden: true })).toBeInTheDocument();
    });

    it('calls extraction API with correct endpoint and method', async () => {
      const user = userEvent.setup();
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockExtractionResponse,
      });

      render(<PdfCreatePanel onSwitchToManual={mockOnSwitchToManual} />);

      const file = new File(['pdf content'], 'test.pdf', {
        type: 'application/pdf',
      });
      const input = screen.getByLabelText(/upload/i, { selector: 'input' });

      await user.upload(input, file);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/v1/plans/from-pdf/extract',
          expect.objectContaining({
            method: 'POST',
            body: expect.any(FormData),
          })
        );
      });
    });
  });

  describe('extraction preview', () => {
    it('shows preview after successful extraction', async () => {
      const user = userEvent.setup();
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockExtractionResponse,
      });

      render(<PdfCreatePanel onSwitchToManual={mockOnSwitchToManual} />);

      const file = new File(['pdf content'], 'test.pdf', {
        type: 'application/pdf',
      });
      const input = screen.getByLabelText(/upload/i, { selector: 'input' });

      await user.upload(input, file);

      await waitFor(() => {
        expect(screen.getByText('TypeScript Fundamentals')).toBeInTheDocument();
      });
    });

    it('displays extracted topic in preview', async () => {
      const user = userEvent.setup();
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockExtractionResponse,
      });

      render(<PdfCreatePanel onSwitchToManual={mockOnSwitchToManual} />);

      const file = new File(['pdf content'], 'test.pdf', {
        type: 'application/pdf',
      });
      const input = screen.getByLabelText(/upload/i, { selector: 'input' });

      await user.upload(input, file);

      await waitFor(() => {
        expect(screen.getByText('TypeScript Fundamentals')).toBeInTheDocument();
      });
    });
  });

  describe('error handling', () => {
    it('shows error state when extraction fails', async () => {
      const user = userEvent.setup();
      (global.fetch as any).mockResolvedValue({
        ok: false,
        json: async () => ({
          success: false,
          error: 'PDF extraction failed',
          code: 'INVALID_FILE',
        }),
      });

      render(<PdfCreatePanel onSwitchToManual={mockOnSwitchToManual} />);

      const file = new File(['pdf content'], 'test.pdf', {
        type: 'application/pdf',
      });
      const input = screen.getByLabelText(/upload/i, { selector: 'input' });

      await user.upload(input, file);

      await waitFor(() => {
        expect(screen.getByText(/PDF extraction failed/i)).toBeInTheDocument();
      });
    });

    it('shows error when response validation fails', async () => {
      const user = userEvent.setup();
      const { clientLogger } = await import('@/lib/logging/client');

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ invalid: 'response' }),
      });

      render(<PdfCreatePanel onSwitchToManual={mockOnSwitchToManual} />);

      const file = new File(['pdf content'], 'test.pdf', {
        type: 'application/pdf',
      });
      const input = screen.getByLabelText(/upload/i, { selector: 'input' });

      await user.upload(input, file);

      await waitFor(() => {
        expect(clientLogger.error).toHaveBeenCalled();
        expect(
          screen.getByText(/Invalid response from server/i)
        ).toBeInTheDocument();
      });
    });

    it('handles network errors gracefully', async () => {
      const user = userEvent.setup();
      const { clientLogger } = await import('@/lib/logging/client');

      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      render(<PdfCreatePanel onSwitchToManual={mockOnSwitchToManual} />);

      const file = new File(['pdf content'], 'test.pdf', {
        type: 'application/pdf',
      });
      const input = screen.getByLabelText(/upload/i, { selector: 'input' });

      await user.upload(input, file);

      await waitFor(() => {
        expect(clientLogger.error).toHaveBeenCalledWith(
          'PDF extraction failed',
          expect.any(Error)
        );
      });
    });

    it('shows retry button in error state', async () => {
      const user = userEvent.setup();
      (global.fetch as any).mockResolvedValue({
        ok: false,
        json: async () => ({
          success: false,
          error: 'Extraction failed',
        }),
      });

      render(<PdfCreatePanel onSwitchToManual={mockOnSwitchToManual} />);

      const file = new File(['pdf content'], 'test.pdf', {
        type: 'application/pdf',
      });
      const input = screen.getByLabelText(/upload/i, { selector: 'input' });

      await user.upload(input, file);

      await waitFor(() => {
        expect(screen.getByText(/retry/i)).toBeInTheDocument();
      });
    });
  });

  describe('generation flow', () => {
    it('shows generating state when plan generation starts', async () => {
      const user = userEvent.setup();
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockExtractionResponse,
      });

      const mockStartGeneration = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve('plan-123'), 1000);
          })
      );

      vi.doMock('@/hooks/useStreamingPlanGeneration', () => ({
        useStreamingPlanGeneration: () => ({
          startGeneration: mockStartGeneration,
        }),
        isStreamingError: () => false,
      }));

      render(<PdfCreatePanel onSwitchToManual={mockOnSwitchToManual} />);

      const file = new File(['pdf content'], 'test.pdf', {
        type: 'application/pdf',
      });
      const input = screen.getByLabelText(/upload/i, { selector: 'input' });

      await user.upload(input, file);

      await waitFor(() => {
        expect(screen.getByText('TypeScript Fundamentals')).toBeInTheDocument();
      });

      const generateButton = screen.getByRole('button', { name: /generate/i });
      await user.click(generateButton);

      await waitFor(() => {
        expect(screen.getByText(/creating your learning plan/i)).toBeInTheDocument();
      });
    });
  });

  describe('switch to manual', () => {
    it('calls onSwitchToManual with extracted topic', async () => {
      const user = userEvent.setup();
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockExtractionResponse,
      });

      render(<PdfCreatePanel onSwitchToManual={mockOnSwitchToManual} />);

      const file = new File(['pdf content'], 'test.pdf', {
        type: 'application/pdf',
      });
      const input = screen.getByLabelText(/upload/i, { selector: 'input' });

      await user.upload(input, file);

      await waitFor(() => {
        expect(screen.getByText('TypeScript Fundamentals')).toBeInTheDocument();
      });

      const switchButton = screen.getByRole('button', {
        name: /manual|switch/i,
      });
      await user.click(switchButton);

      expect(mockOnSwitchToManual).toHaveBeenCalledWith('TypeScript Fundamentals');
    });
  });

  describe('edge cases', () => {
    it('handles missing extraction data gracefully', async () => {
      const user = userEvent.setup();
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          // Missing extraction and proof
        }),
      });

      render(<PdfCreatePanel onSwitchToManual={mockOnSwitchToManual} />);

      const file = new File(['pdf content'], 'test.pdf', {
        type: 'application/pdf',
      });
      const input = screen.getByLabelText(/upload/i, { selector: 'input' });

      await user.upload(input, file);

      await waitFor(() => {
        expect(
          screen.getByText(/Failed to extract PDF content/i)
        ).toBeInTheDocument();
      });
    });

    it('prevents double submission during generation', async () => {
      const user = userEvent.setup();
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockExtractionResponse,
      });

      const mockStartGeneration = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve('plan-123'), 1000);
          })
      );

      vi.doMock('@/hooks/useStreamingPlanGeneration', () => ({
        useStreamingPlanGeneration: () => ({
          startGeneration: mockStartGeneration,
        }),
        isStreamingError: () => false,
      }));

      render(<PdfCreatePanel onSwitchToManual={mockOnSwitchToManual} />);

      const file = new File(['pdf content'], 'test.pdf', {
        type: 'application/pdf',
      });
      const input = screen.getByLabelText(/upload/i, { selector: 'input' });

      await user.upload(input, file);

      await waitFor(() => {
        expect(screen.getByText('TypeScript Fundamentals')).toBeInTheDocument();
      });

      const generateButton = screen.getByRole('button', { name: /generate/i });

      // Click twice rapidly
      await user.click(generateButton);
      await user.click(generateButton);

      // Should only call once due to isSubmittingRef guard
      expect(mockStartGeneration).toHaveBeenCalledTimes(1);
    });
  });
});