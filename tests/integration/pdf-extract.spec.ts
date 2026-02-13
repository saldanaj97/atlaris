import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest';

import { clearTestUser, setTestUser } from '@/../tests/helpers/auth';
import {
  ensureStripeWebhookEvents,
  ensureUser,
  resetDbForIntegrationTestFile,
} from '@/../tests/helpers/db';
import {
  createPostHandler,
  type PdfExtractRouteDeps,
} from '@/app/api/v1/plans/from-pdf/extract/route';
import {
  _dangerousResetPdfExtractionThrottleForTests,
  acquireGlobalPdfExtractionSlot,
} from '@/lib/api/pdf-rate-limit';

const BASE_URL = 'http://localhost/api/v1/plans/from-pdf/extract';
const MAX_SLOT_ATTEMPTS = 100;

const PDF_BYTES = Buffer.from('%PDF-1.4\n%%EOF', 'utf8');
const PDF_FILE_NAME = 'sample.pdf';

let mockExtractTextFromPdf: Mock<PdfExtractRouteDeps['extractTextFromPdf']>;
let mockGetPdfPageCountFromBuffer: Mock<
  PdfExtractRouteDeps['getPdfPageCountFromBuffer']
>;
let mockScanBufferForMalware: Mock<PdfExtractRouteDeps['scanBufferForMalware']>;
let postHandler: ReturnType<typeof createPostHandler>;

const createMultipartPdfBody = (
  fileBytes: Buffer,
  fileName: string
): { body: ArrayBuffer; boundary: string } => {
  const boundary = '----vitest-pdf-boundary';

  const prefix = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="file"; filename="${fileName}"`,
    'Content-Type: application/pdf',
    '',
    '',
  ].join('\r\n');

  const suffix = `\r\n--${boundary}--\r\n`;

  const bytes = Buffer.concat([
    Buffer.from(prefix, 'utf8'),
    fileBytes,
    Buffer.from(suffix, 'utf8'),
  ]);

  const body = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  );

  return {
    body,
    boundary,
  };
};

const createPdfRequest = (): Request => {
  const { body, boundary } = createMultipartPdfBody(PDF_BYTES, PDF_FILE_NAME);

  return new Request(BASE_URL, {
    method: 'POST',
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      'content-length': String(body.byteLength),
    },
    body,
  });
};

describe('POST /api/v1/plans/from-pdf/extract', () => {
  beforeEach(async () => {
    await resetDbForIntegrationTestFile();
    await ensureStripeWebhookEvents();
    mockExtractTextFromPdf = vi.fn();
    mockGetPdfPageCountFromBuffer = vi.fn();
    mockScanBufferForMalware = vi.fn();
    mockGetPdfPageCountFromBuffer.mockResolvedValue(1);
    mockScanBufferForMalware.mockResolvedValue({ clean: true });
    postHandler = createPostHandler({
      extractTextFromPdf: mockExtractTextFromPdf,
      getPdfPageCountFromBuffer: mockGetPdfPageCountFromBuffer,
      scanBufferForMalware: mockScanBufferForMalware,
    });
  });

  afterEach(() => {
    clearTestUser();
    _dangerousResetPdfExtractionThrottleForTests();
  });

  it('extracts text and structure from a PDF', async () => {
    const authUserId = `auth_pdf_extract_${Date.now()}`;
    const authEmail = `pdf-extract-${Date.now()}@test.local`;

    setTestUser(authUserId);
    await ensureUser({ authUserId, email: authEmail });

    mockExtractTextFromPdf.mockResolvedValue({
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
    const response = await postHandler(request);

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
    expect(payload.extraction.truncation).toBeDefined();
    expect(payload.extraction.truncation.truncated).toBe(false);
  });

  it('returns truncation metadata when extraction payload is capped', async () => {
    const authUserId = `auth_pdf_extract_truncated_${Date.now()}`;
    const authEmail = `pdf-extract-truncated-${Date.now()}@test.local`;

    setTestUser(authUserId);
    await ensureUser({ authUserId, email: authEmail });

    mockExtractTextFromPdf.mockResolvedValue({
      success: true,
      text: 'x'.repeat(200_000),
      pageCount: 1,
      metadata: { title: undefined, author: undefined, subject: undefined },
      structure: {
        sections: Array.from({ length: 40 }, (_, idx) => ({
          title: `Section ${idx + 1}`,
          content: 'y'.repeat(4_000),
          level: 1,
        })),
        suggestedMainTopic: 'Very large document',
        confidence: 'high',
      },
    });

    const request = createPdfRequest();
    const response = await postHandler(request);

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.extraction.truncation.truncated).toBe(true);
    expect(payload.extraction.truncation.maxBytes).toSatisfy(
      (value: unknown) =>
        typeof value === 'number' && Number.isFinite(value) && value > 0
    );
    expect(payload.extraction.truncation.returnedBytes).toSatisfy(
      (value: unknown) => typeof value === 'number' && Number.isFinite(value)
    );
    expect(payload.extraction.truncation.returnedBytes).toBeLessThanOrEqual(
      payload.extraction.truncation.maxBytes
    );
  });

  it('returns 400 when extraction finds no text', async () => {
    const authUserId = `auth_pdf_notext_${Date.now()}`;
    const authEmail = `pdf-notext-${Date.now()}@test.local`;

    setTestUser(authUserId);
    await ensureUser({ authUserId, email: authEmail });

    mockExtractTextFromPdf.mockResolvedValue({
      success: false,
      error: 'no_text',
      message: 'PDF does not contain extractable text.',
    });

    const request = createPdfRequest();
    const response = await postHandler(request);

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

    mockScanBufferForMalware.mockResolvedValue({
      clean: false,
      threat: 'MetaDefender-Infected',
    });

    const request = createPdfRequest();
    const response = await postHandler(request);

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe('MALWARE_DETECTED');
    expect(mockExtractTextFromPdf).not.toHaveBeenCalled();
  });

  it('returns 500 when malware scan fails (fail-closed)', async () => {
    const authUserId = `auth_pdf_scanfail_${Date.now()}`;
    const authEmail = `pdf-scanfail-${Date.now()}@test.local`;

    setTestUser(authUserId);
    await ensureUser({ authUserId, email: authEmail });

    mockScanBufferForMalware.mockRejectedValue(new Error('Scanner timeout'));

    const request = createPdfRequest();
    const response = await postHandler(request);

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe('SCAN_FAILED');
    expect(mockExtractTextFromPdf).not.toHaveBeenCalled();
  });

  it('returns 422 when extraction times out', async () => {
    const authUserId = `auth_pdf_timeout_${Date.now()}`;
    const authEmail = `pdf-timeout-${Date.now()}@test.local`;

    setTestUser(authUserId);
    await ensureUser({ authUserId, email: authEmail });

    mockExtractTextFromPdf.mockResolvedValue({
      success: false,
      error: 'parse_timeout',
      message: 'PDF parsing timed out. The file may be too complex.',
    });

    const request = createPdfRequest();
    const response = await postHandler(request);

    expect(response.status).toBe(422);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe('INVALID_FILE');
  });

  it('returns 429 when global extraction concurrency is saturated', async () => {
    const authUserId = `auth_pdf_global_throttle_${Date.now()}`;
    const authEmail = `pdf-global-throttle-${Date.now()}@test.local`;

    setTestUser(authUserId);
    await ensureUser({ authUserId, email: authEmail });

    // Saturate the throttle: acquire slots via acquireGlobalPdfExtractionSlot() until
    // it returns allowed === false (throttle limit). Keeps test resilient to config changes.
    const slots: ReturnType<typeof acquireGlobalPdfExtractionSlot>[] = [];
    let slot = acquireGlobalPdfExtractionSlot();
    let slotAttempts = 0;
    while (slot.allowed && slotAttempts < MAX_SLOT_ATTEMPTS) {
      slots.push(slot);
      slotAttempts += 1;
      slot = acquireGlobalPdfExtractionSlot();
    }

    if (slot.allowed) {
      for (const acquiredSlot of slots) {
        if (acquiredSlot.allowed) {
          acquiredSlot.release();
        }
      }
      throw new Error(
        `Failed to saturate PDF extraction slots within ${MAX_SLOT_ATTEMPTS} attempts. Potential regression in acquireGlobalPdfExtractionSlot().`
      );
    }

    try {
      const request = createPdfRequest();
      const response = await postHandler(request);

      expect(response.status).toBe(429);
      expect(response.headers.get('Retry-After')).toBeTruthy();
      const payload = await response.json();
      expect(payload.success).toBe(false);
      expect(payload.code).toBe('THROTTLED');
      expect(mockExtractTextFromPdf).not.toHaveBeenCalled();
    } finally {
      for (const slot of slots) {
        if (slot.allowed) {
          slot.release();
        }
      }
    }
  });

  it('returns 401 when unauthenticated', async () => {
    clearTestUser();

    const request = createPdfRequest();
    const response = await postHandler(request);

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

    const response = await postHandler(request);

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

    const response = await postHandler(request);

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe('INVALID_FILE');
  });
});
