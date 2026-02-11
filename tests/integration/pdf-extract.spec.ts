import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/pdf/extract', () => ({
  extractTextFromPdf: vi.fn(),
  getPdfPageCountFromBuffer: vi.fn(),
}));

vi.mock('@/lib/security/malware-scanner', () => ({
  scanBufferForMalware: vi.fn(),
}));

import { clearTestUser, setTestUser } from '@/../tests/helpers/auth';
import {
  ensureStripeWebhookEvents,
  ensureUser,
  resetDbForIntegrationTestFile,
} from '@/../tests/helpers/db';
import { POST } from '@/app/api/v1/plans/from-pdf/extract/route';
import {
  extractTextFromPdf,
  getPdfPageCountFromBuffer,
} from '@/lib/pdf/extract';
import { scanBufferForMalware } from '@/lib/security/malware-scanner';

const BASE_URL = 'http://localhost/api/v1/plans/from-pdf/extract';

type PdfExtractTestRequest = Request & {
  formData: () => Promise<FormData>;
};

const createPdfRequest = (): PdfExtractTestRequest => {
  const form = new FormData();
  const pdfHeader = '%PDF-1.4\n%%EOF';
  const buffer = Buffer.from(pdfHeader, 'utf8');
  const file = new File([buffer], 'sample.pdf', { type: 'application/pdf' });
  // Ensure arrayBuffer exists in the test runtime.
  const fileWithArrayBuffer = Object.assign(file, {
    arrayBuffer: async () => buffer,
  });
  form.append('file', fileWithArrayBuffer);

  // Do not pass custom headers — let Request set Content-Type (multipart/form-data + boundary)
  // and Content-Length from the FormData body. Overriding headers drops Content-Type and
  // causes streamedSizeCheck to return INVALID_FILE.
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
    vi.mocked(getPdfPageCountFromBuffer).mockReset();
    vi.mocked(getPdfPageCountFromBuffer).mockResolvedValue(1);
    vi.mocked(scanBufferForMalware).mockReset();
    vi.mocked(scanBufferForMalware).mockResolvedValue({ clean: true });
  });

  afterEach(() => {
    clearTestUser();
  });

  it('extracts text and structure from a PDF', async () => {
    const authUserId = `auth_pdf_extract_${Date.now()}`;
    const authEmail = `pdf-extract-${Date.now()}@test.local`;

    setTestUser(authUserId);
    await ensureUser({ authUserId, email: authEmail });

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
    expect(payload.proof).toBeDefined();
    expect(payload.proof.token).toBeTypeOf('string');
    expect(payload.proof.token.length).toBeGreaterThan(20);
    expect(payload.proof.extractionHash).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.proof.version).toBe(1);
    expect(payload.proof.expiresAt).toBeTypeOf('string');

    expect(payload.extraction.structure.sections).toHaveLength(1);
    const section = payload.extraction.structure.sections[0];
    expect(section.content).toContain('Hello PDF');
  });

  it('returns 400 when extraction finds no text', async () => {
    const authUserId = `auth_pdf_notext_${Date.now()}`;
    const authEmail = `pdf-notext-${Date.now()}@test.local`;

    setTestUser(authUserId);
    await ensureUser({ authUserId, email: authEmail });

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

  it('returns 400 when malware is detected before extraction', async () => {
    const authUserId = `auth_pdf_malware_${Date.now()}`;
    const authEmail = `pdf-malware-${Date.now()}@test.local`;

    setTestUser(authUserId);
    await ensureUser({ authUserId, email: authEmail });

    vi.mocked(scanBufferForMalware).mockResolvedValue({
      clean: false,
      threat: 'MetaDefender-Infected',
    });

    const request = createPdfRequest();
    const response = await POST(request);

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe('MALWARE_DETECTED');
    expect(extractTextFromPdf).not.toHaveBeenCalled();
  });

  it('returns 500 when malware scan fails (fail-closed)', async () => {
    const authUserId = `auth_pdf_scanfail_${Date.now()}`;
    const authEmail = `pdf-scanfail-${Date.now()}@test.local`;

    setTestUser(authUserId);
    await ensureUser({ authUserId, email: authEmail });

    vi.mocked(scanBufferForMalware).mockRejectedValue(
      new Error('Scanner timeout')
    );

    const request = createPdfRequest();
    const response = await POST(request);

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe('SCAN_FAILED');
    expect(extractTextFromPdf).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    clearTestUser();

    const request = createPdfRequest();
    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it('returns 411 when multipart request body is missing', async () => {
    const authUserId = `auth_pdf_missing_body_${Date.now()}`;
    const authEmail = `pdf-missing-body-${Date.now()}@test.local`;

    setTestUser(authUserId);
    await ensureUser({ authUserId, email: authEmail });

    const request = new Request(BASE_URL, {
      method: 'POST',
      headers: {
        'content-type': 'multipart/form-data; boundary=test-boundary',
      },
    });

    const response = await POST(request);

    expect(response.status).toBe(411);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe('MISSING_CONTENT_LENGTH');
  });

  it('returns 400 when request body is invalid JSON (non-multipart)', async () => {
    const authUserId = `auth_pdf_invalid_content_type_${Date.now()}`;
    const authEmail = `pdf-invalid-content-type-${Date.now()}@test.local`;

    setTestUser(authUserId);
    await ensureUser({ authUserId, email: authEmail });

    const body = JSON.stringify({ file: 'not-a-pdf' });
    const request = new Request(BASE_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(body.length),
      },
      body,
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe('INVALID_FILE');
  });
});
