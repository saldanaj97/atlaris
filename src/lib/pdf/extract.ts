import { PDFParse, PasswordException } from 'pdf-parse';

import { detectStructure } from './structure';
import type { PdfExtractionResponse } from './types';

const PDF_HEADER = '%PDF-';
const ENCRYPT_TOKEN = '/Encrypt';

const getMetadataField = (
  info: unknown,
  key: 'Title' | 'Author' | 'Subject'
): string | undefined => {
  if (!info || typeof info !== 'object') {
    return undefined;
  }

  const value = (info as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
};

export const extractTextFromPdf = async (
  buffer: Buffer
): Promise<PdfExtractionResponse> => {
  const header = buffer.subarray(0, 5).toString('utf8');

  if (!header.startsWith(PDF_HEADER)) {
    return {
      success: false,
      error: 'invalid_file',
      message: 'File does not appear to be a valid PDF.',
    };
  }

  const headerScan = buffer.subarray(0, 2048).toString('latin1');
  if (headerScan.includes(ENCRYPT_TOKEN)) {
    return {
      success: false,
      error: 'password_protected',
      message: 'Password-protected PDFs are not supported.',
    };
  }

  try {
    const parser = new PDFParse({ data: buffer });
    const textResult = await parser.getText();
    const infoResult = await parser.getInfo();
    await parser.destroy();
    const text = textResult.text?.trim() ?? '';

    if (text.length === 0) {
      return {
        success: false,
        error: 'no_text',
        message: 'PDF does not contain extractable text.',
      };
    }

    const structure = detectStructure(text);

    return {
      success: true,
      text,
      pageCount: textResult.total ?? 0,
      metadata: {
        title: getMetadataField(infoResult.info, 'Title'),
        author: getMetadataField(infoResult.info, 'Author'),
        subject: getMetadataField(infoResult.info, 'Subject'),
      },
      structure,
    };
  } catch (error) {
    const message = getErrorMessage(error);
    const lowerMessage = message.toLowerCase();

    if (error instanceof PasswordException) {
      return {
        success: false,
        error: 'password_protected',
        message: 'Password-protected PDFs are not supported.',
      };
    }

    if (lowerMessage.includes('password')) {
      return {
        success: false,
        error: 'password_protected',
        message: 'Password-protected PDFs are not supported.',
      };
    }

    return {
      success: false,
      error: 'extraction_failed',
      message,
    };
  }
};
