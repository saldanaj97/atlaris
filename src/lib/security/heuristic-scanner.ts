import { logger as defaultLogger } from '@/lib/logging/logger';
import type { ScanProvider, ScanVerdict } from '@/lib/security/scanner.types';

/** Minimal logger interface for DI; callers may pass a full Logger or a mock. */
export interface HeuristicScanLogger {
  debug(...args: unknown[]): void;
  warn(...args: unknown[]): void;
}

const MAX_SCAN_STRING_BYTES = 5 * 1024 * 1024;
const PDF_MAGIC_BYTES = Buffer.from('%PDF-', 'utf8');
const EICAR_SIGNATURE =
  'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

const isAsciiAlphaNumeric = (byte: number): boolean => {
  return (
    (byte >= 48 && byte <= 57) ||
    (byte >= 65 && byte <= 90) ||
    (byte >= 97 && byte <= 122)
  );
};

const hasPdfNameToken = (buffer: Buffer, token: string): boolean => {
  let offset = 0;
  while (offset < buffer.length) {
    const index = buffer.indexOf(token, offset, 'latin1');
    if (index === -1) {
      return false;
    }
    const before = index > 0 ? buffer[index - 1] : undefined;
    const after =
      index + token.length < buffer.length
        ? buffer[index + token.length]
        : undefined;
    const beforeOk = before === undefined || !isAsciiAlphaNumeric(before);
    const afterOk = after === undefined || !isAsciiAlphaNumeric(after);
    if (beforeOk && afterOk) {
      return true;
    }
    offset = index + token.length;
  }
  return false;
};

const hasPdfJavaScriptTokens = (content: string): boolean => {
  return (
    /\/JavaScript(?![A-Za-z0-9])/.test(content) ||
    /\/Launch(?![A-Za-z0-9])/.test(content) ||
    /\/JS(?![A-Za-z0-9])/.test(content)
  );
};

export function scanBufferWithHeuristics(
  buffer: Buffer,
  logger: HeuristicScanLogger = defaultLogger
): ScanVerdict {
  const canStringify = buffer.length <= MAX_SCAN_STRING_BYTES;
  const content = canStringify ? buffer.toString('latin1') : null;

  const hasEicar = content
    ? content.includes(EICAR_SIGNATURE)
    : buffer.indexOf(EICAR_SIGNATURE, 0, 'latin1') !== -1;
  if (hasEicar) {
    logger.warn(
      { signature: 'EICAR', size: buffer.length },
      'Heuristic malware scan detected EICAR test file'
    );
    return { clean: false, threat: 'EICAR-Test-File' };
  }

  const isPdf =
    buffer.length >= PDF_MAGIC_BYTES.length &&
    buffer.subarray(0, PDF_MAGIC_BYTES.length).equals(PDF_MAGIC_BYTES);
  const hasJsTokens = content
    ? hasPdfJavaScriptTokens(content)
    : hasPdfNameToken(buffer, '/JavaScript') ||
      hasPdfNameToken(buffer, '/Launch') ||
      hasPdfNameToken(buffer, '/JS');

  if (isPdf && hasJsTokens) {
    logger.warn(
      { signature: 'PDF-JavaScript', size: buffer.length },
      'Heuristic malware scan detected JavaScript in PDF'
    );
    return { clean: false, threat: 'PDF-JavaScript-Suspicious' };
  }

  logger.debug(
    { size: buffer.length },
    'Heuristic malware scan completed without findings'
  );
  return { clean: true };
}

export class HeuristicScanProvider implements ScanProvider {
  public readonly name = 'heuristic';

  constructor(public readonly logger?: HeuristicScanLogger) {}

  public async scan(buffer: Buffer): Promise<ScanVerdict> {
    return await Promise.resolve().then(() =>
      scanBufferWithHeuristics(buffer, this.logger ?? defaultLogger)
    );
  }
}

export const heuristicScanProvider = new HeuristicScanProvider();
