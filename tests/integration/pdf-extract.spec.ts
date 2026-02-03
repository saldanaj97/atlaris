import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/pdf/extract', () => ({
  extractTextFromPdf: vi.fn(),
}));

vi.mock('@/lib/security/malware-scanner', () => ({
  scanBufferForMalware: vi.fn(),
}));

import { POST } from '@/app/api/v1/plans/from-pdf/extract/route';
import { scanBufferForMalware } from '@/lib/security/malware-scanner';
import { extractTextFromPdf } from '@/lib/pdf/extract';
import { clearTestUser, setTestUser } from '@/../tests/helpers/auth';
import {
  ensureStripeWebhookEvents,
  ensureUser,
  resetDbForIntegrationTestFile,
} from '@/../tests/helpers/db';

const BASE_URL = 'http://localhost/api/v1/plans/from-pdf/extract';

const createPdfRequest = () => {
  const form = new FormData();
  const pdfHeader = '%PDF-1.4\n%%EOF';
  const buffer = Buffer.from(pdfHeader, 'utf8');
  const file = new File([buffer], 'sample.pdf', { type: 'application/pdf' });
  form.append('file', file);

  const request = new Request(BASE_URL, {
    method: 'POST',
    body: form,
  });

  // Vitest/undici multipart parsing can drop File entries; override for stability.
  return Object.assign(request, {
    formData: async () => form,
  });
};

describe('POST /api/v1/plans/from-pdf/extract', () => {
  beforeEach(async () => {
    await resetDbForIntegrationTestFile();
    await ensureStripeWebhookEvents();
    vi.mocked(extractTextFromPdf).mockReset();
    vi.mocked(scanBufferForMalware).mockReset();
    vi.mocked(scanBufferForMalware).mockResolvedValue({ clean: true });
  });

  afterEach(() => {
    clearTestUser();
  });

  it('extracts text and structure from a PDF', async () => {
    const clerkUserId = `clerk_pdf_extract_${Date.now()}`;
    const clerkEmail = `pdf-extract-${Date.now()}@test.local`;

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
    const clerkUserId = `clerk_pdf_notext_${Date.now()}`;
    const clerkEmail = `pdf-notext-${Date.now()}@test.local`;

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
