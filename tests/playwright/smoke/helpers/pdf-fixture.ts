import { writeFile } from 'node:fs/promises';

import type { TestInfo } from '@playwright/test';

function escapePdfString(text: string): string {
  return text
    .replaceAll('\\', '\\\\')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)');
}

export function buildMinimalPdfBuffer(text: string, pageCount = 1): Buffer {
  if (pageCount < 1) {
    throw new Error('buildMinimalPdfBuffer requires pageCount >= 1');
  }

  const header = '%PDF-1.4\n';
  const escapedText = escapePdfString(text);
  const streamContent = [
    'BT\n',
    '/F1 24 Tf\n',
    '72 120 Td\n',
    `(${escapedText}) Tj\n`,
    'ET\n',
  ].join('');
  const streamLength = Buffer.byteLength(streamContent, 'utf8');
  const pageRefs = Array.from(
    { length: pageCount },
    (_, index) => `${3 + index} 0 R`
  ).join(' ');

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    `2 0 obj\n<< /Type /Pages /Kids [${pageRefs}] /Count ${pageCount} >>\nendobj\n`,
  ];

  for (let index = 0; index < pageCount; index += 1) {
    const pageObjectNumber = 3 + index;
    const contentObjectNumber = 3 + pageCount + index;
    objects.push(
      `${pageObjectNumber} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents ${contentObjectNumber} 0 R /Resources << /Font << /F1 ${3 + pageCount * 2} 0 R >> >> >>\nendobj\n`
    );
  }

  for (let index = 0; index < pageCount; index += 1) {
    const contentObjectNumber = 3 + pageCount + index;
    objects.push(
      `${contentObjectNumber} 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamContent}endstream\nendobj\n`
    );
  }

  const fontObjectNumber = 3 + pageCount * 2;
  objects.push(
    `${fontObjectNumber} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`
  );

  let pdf = header;
  const offsets = [0];

  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += object;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  const objectCount = objects.length + 1;
  const xrefLines = offsets
    .slice(1)
    .map((offset) => `${offset.toString().padStart(10, '0')} 00000 n `)
    .join('\n');

  pdf += `xref\n0 ${objectCount}\n0000000000 65535 f \n${xrefLines}\n`;
  pdf += `trailer\n<< /Root 1 0 R /Size ${objectCount} >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'utf8');
}

async function writeFixtureFile(
  testInfo: TestInfo,
  fileName: string,
  contents: Buffer
): Promise<string> {
  const path = testInfo.outputPath(fileName);
  await writeFile(path, contents);
  return path;
}

export async function writeSmokePdfFixture(
  testInfo: TestInfo,
  text: string,
  pageCount = 1
): Promise<string> {
  return writeFixtureFile(
    testInfo,
    'smoke-plan.pdf',
    buildMinimalPdfBuffer(text, pageCount)
  );
}

export async function writeInvalidUploadFixture(
  testInfo: TestInfo
): Promise<string> {
  return writeFixtureFile(
    testInfo,
    'not-a-pdf.txt',
    Buffer.from('This is not a PDF file', 'utf8')
  );
}
