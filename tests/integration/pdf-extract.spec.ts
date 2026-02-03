import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/v1/plans/from-pdf/extract/route';
import { extractTextFromPdf } from '@/lib/pdf/extract';
import { clearTestUser, setTestUser } from '@/../tests/helpers/auth';
import { ensureUser } from '@/../tests/helpers/db';

vi.mock('@/lib/pdf/extract', () => ({
  extractTextFromPdf: vi.fn(),
}));

const BASE_URL = 'http://localhost/api/v1/plans/from-pdf/extract';

const createPdfRequest = () => {
  const form = new FormData();
  const pdfHeader = '%PDF-1.4\n%%EOF';
  const buffer = Buffer.from(pdfHeader, 'utf8');
  const blob = new Blob([new Uint8Array(buffer)], {
    type: 'application/pdf',
  });
  const file = new File([blob], 'sample.pdf', { type: 'application/pdf' });
  form.append('file', file);

  return new Request(BASE_URL, {
    method: 'POST',
    body: form,
  });
};

describe('POST /api/v1/plans/from-pdf/extract', () => {
  beforeEach(() => {
    vi.mocked(extractTextFromPdf).mockReset();
  });

  afterEach(() => {
    clearTestUser();
  });

  it('extracts text and structure from a PDF', async () => {
    const clerkUserId = `clerk_test_pdf_extract_user`;
    const clerkEmail = `pdf-extract-test@example.com`;

    setTestUser(clerkUserId);
    await ensureUser({ clerkUserId, email: clerkEmail });

    vi.mocked(extractTextFromPdf).mockResolvedValue({
      success: true,
      text: 'Hello PDF',
      pageCount: 1,
      metadata: { title: undefined, author: undefined, subject: undefined },
      structure: {
        sections: [{ title: 'Content', content: 'Hello PDF', level: 1 }],
        suggestedMainTopic: 'Hello PDF',
        confidence: 'medium',
      },
    });

    const request = createPdfRequest();
    const response = await POST(request);

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.extraction.text).toContain('Hello PDF');
    expect(payload.extraction.pageCount).toBe(1);

    expect(payload.extraction.structure.sections).toHaveLength(1);
    const section = payload.extraction.structure.sections[0];
    expect(section.content).toContain('Hello PDF');
  });

  it('returns 400 when extraction finds no text', async () => {
    const clerkUserId = `clerk_test_pdf_no_text`;
    const clerkEmail = `pdf-no-text@example.com`;

    setTestUser(clerkUserId);
    await ensureUser({ clerkUserId, email: clerkEmail });

    vi.mocked(extractTextFromPdf).mockResolvedValue({
      success: false,
      error: 'no_text',
      message: 'PDF does not contain extractable text.',
    });

    const request = createPdfRequest();
    const response = await POST(request);

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe('NO_TEXT');
  });

  it('returns 401 when unauthenticated', async () => {
    clearTestUser();

    const request = createPdfRequest();
    const response = await POST(request);

    expect(response.status).toBe(401);
  });
});
