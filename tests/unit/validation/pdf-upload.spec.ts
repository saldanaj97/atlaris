import { describe, expect, it } from 'vitest';

import { pdfUploadFileSchema } from '@/features/pdf/validation/pdf';

const createUpload = (type: string) => ({
  size: 128,
  type,
  arrayBuffer: async () => new ArrayBuffer(128),
});

describe('pdfUploadFileSchema', () => {
  it('accepts uploads with an explicit application/pdf MIME type', () => {
    const result = pdfUploadFileSchema.safeParse(
      createUpload('application/pdf')
    );

    expect(result.success).toBe(true);
  });

  it('rejects uploads without an explicit application/pdf MIME type', () => {
    const result = pdfUploadFileSchema.safeParse(createUpload(''));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        'Only PDF files are supported.'
      );
    }
  });
});
