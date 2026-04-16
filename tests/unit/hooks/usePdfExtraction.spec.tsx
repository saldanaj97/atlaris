import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePdfExtraction } from '@/hooks/usePdfExtraction';

const validExtractionJson = {
  success: true,
  extraction: {
    structure: {
      suggestedMainTopic: 'Topic',
      sections: [
        { title: 'A', content: 'b', level: 1, suggestedTopic: 'Topic' },
      ],
      confidence: 'high' as const,
    },
    pageCount: 2,
  },
  proof: {
    token: 'tok',
    extractionHash: 'hash',
    expiresAt: '2030-01-01T00:00:00.000Z',
    version: 1 as const,
  },
};

describe('usePdfExtraction', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns false for non-PDF files without calling fetch', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const { result } = renderHook(() => usePdfExtraction());

    let accepted = true;
    await act(async () => {
      accepted = result.current.startExtraction(
        new File(['x'], 'x.txt', { type: 'text/plain' })
      );
    });

    expect(accepted).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current.state.phase).toBe('idle');
  });

  it('sets success with extraction payload when API succeeds', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(validExtractionJson), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { result } = renderHook(() => usePdfExtraction());

    await act(async () => {
      result.current.startExtraction(
        new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' })
      );
    });

    await waitFor(() => {
      expect(result.current.state.phase).toBe('success');
    });

    if (result.current.state.phase !== 'success') {
      throw new Error('expected success');
    }
    expect(result.current.state.data.extraction.mainTopic).toBe('Topic');
    expect(result.current.state.data.proof.token).toBe('tok');
  });

  it('returns to idle on user cancel (abort) of in-flight extraction', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((_url, init) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          reject(new Error('expected AbortSignal'));
          return;
        }
        const onAbort = () =>
          reject(new DOMException('The user aborted a request.', 'AbortError'));
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      });
    });

    const { result } = renderHook(() => usePdfExtraction());

    await act(async () => {
      result.current.startExtraction(
        new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' })
      );
    });

    expect(result.current.state.phase).toBe('uploading');

    await act(async () => {
      result.current.cancelExtraction();
    });

    await waitFor(() => {
      expect(result.current.state.phase).toBe('idle');
    });
  });

  it('sets timeout error when abort reason is timeout', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((_url, init) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          reject(new Error('expected AbortSignal'));
          return;
        }
        const onAbort = () =>
          reject(new DOMException('The user aborted a request.', 'AbortError'));
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      });
    });

    const { result } = renderHook(() =>
      usePdfExtraction({ extractionTimeoutMs: 15 })
    );

    await act(async () => {
      result.current.startExtraction(
        new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' })
      );
    });

    await waitFor(
      () => {
        expect(result.current.state.phase).toBe('error');
      },
      { timeout: 2000 }
    );

    if (result.current.state.phase !== 'error') {
      throw new Error('expected error');
    }
    expect(result.current.state.kind).toBe('timeout');
    expect(result.current.state.message).toMatch(/timed out/i);
  });

  it('includes truncation notice metadata on success when response is truncated', async () => {
    const truncatedJson = {
      ...validExtractionJson,
      extraction: {
        ...validExtractionJson.extraction,
        truncation: {
          truncated: true,
          maxBytes: 1000,
          returnedBytes: 500,
          reasons: ['text_char_cap'],
          limits: {
            maxTextChars: 100,
            maxSections: 20,
            maxSectionChars: 200,
          },
        },
      },
    };

    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(truncatedJson), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { result } = renderHook(() => usePdfExtraction());

    await act(async () => {
      result.current.startExtraction(
        new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' })
      );
    });

    await waitFor(() => {
      expect(result.current.state.phase).toBe('success');
    });

    if (result.current.state.phase !== 'success') {
      throw new Error('expected success');
    }
    expect(result.current.state.notice?.truncated).toBe(true);
    expect(result.current.state.notice?.reasonCodes).toContain('text_char_cap');
  });
});
