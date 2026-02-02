import { afterEach, describe, expect, it } from 'vitest';

import { POST } from '@/app/api/v1/plans/from-pdf/extract/route';
import { clearTestUser, setTestUser } from '@/../tests/helpers/auth';
import { ensureUser } from '@/../tests/helpers/db';

const BASE_URL = 'http://localhost/api/v1/plans/from-pdf/extract';

const buildPdfBuffer = (text: string) => {
  const header = '%PDF-1.4\n';
  const streamContent = [
    'BT\n',
    '/F1 24 Tf\n',
    '72 120 Td\n',
    `(${text}) Tj\n`,
    'ET\n',
  ].join('');
  const streamLength = Buffer.byteLength(streamContent, 'utf8');

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamContent}endstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];

  let pdf = header;
  const offsets = [0];

  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += object;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  const xrefLines = offsets
    .slice(1)
    .map((offset) => `${offset.toString().padStart(10, '0')} 00000 n `)
    .join('\n');

  pdf += `xref\n0 6\n0000000000 65535 f \n${xrefLines}\n`;
  pdf += `trailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'utf8');
};

const createRequest = (buffer: Buffer) => {
  const form = new FormData();
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
  afterEach(() => {
    clearTestUser();
  });

  it('extracts text and structure from a PDF', async () => {
    const clerkUserId = `clerk_test_pdf_extract_user`;
    const clerkEmail = `pdf-extract-test@example.com`;

    setTestUser(clerkUserId);
    await ensureUser({ clerkUserId, email: clerkEmail });

    const request = createRequest(buildPdfBuffer('Hello PDF'));
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
});
