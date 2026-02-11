import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Logger } from '@/lib/logging/logger';
import { logger as defaultLogger } from '@/lib/logging/logger';
import type { ScanProvider, ScanVerdict } from '@/lib/security/scanner.types';

vi.mock('@/lib/security/heuristic-scanner', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/security/heuristic-scanner')>();
  const scanBufferWithHeuristics = vi.fn(actual.scanBufferWithHeuristics);

  class MockableHeuristicScanProvider implements ScanProvider {
    public readonly name = 'heuristic';
    constructor(public readonly logger?: Logger) {}
    public async scan(buffer: Buffer): Promise<ScanVerdict> {
      return scanBufferWithHeuristics(buffer, this.logger ?? defaultLogger);
    }
  }

  return {
    ...actual,
    scanBufferWithHeuristics,
    HeuristicScanProvider: MockableHeuristicScanProvider,
    heuristicScanProvider: new MockableHeuristicScanProvider(),
  };
});

import {
  HeuristicScanProvider,
  heuristicScanProvider,
  scanBufferWithHeuristics,
} from '@/lib/security/heuristic-scanner';

const makeMockLogger = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

describe('heuristic-scanner', () => {
  let mockLogger: ReturnType<typeof makeMockLogger>;

  beforeEach(() => {
    mockLogger = makeMockLogger();
    vi.clearAllMocks();
  });

  it('returns clean for harmless content', () => {
    const buffer = Buffer.from('plain text content', 'utf8');

    expect(scanBufferWithHeuristics(buffer, mockLogger)).toEqual({
      clean: true,
    });
  });

  it('detects the EICAR signature', () => {
    const eicar =
      'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
    const buffer = Buffer.from(eicar, 'latin1');

    expect(scanBufferWithHeuristics(buffer, mockLogger)).toEqual({
      clean: false,
      threat: 'EICAR-Test-File',
    });
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ signature: 'EICAR', size: buffer.length }),
      expect.stringMatching(/heuristic malware scan detected EICAR/i)
    );
  });

  it('detects suspicious JavaScript tokens in a PDF', () => {
    const buffer = Buffer.from(
      '%PDF-1.7\n1 0 obj\n/JavaScript\n%%EOF',
      'latin1'
    );

    expect(scanBufferWithHeuristics(buffer, mockLogger)).toEqual({
      clean: false,
      threat: 'PDF-JavaScript-Suspicious',
    });
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        signature: 'PDF-JavaScript',
        size: buffer.length,
      }),
      expect.stringMatching(
        /heuristic malware scan detected JavaScript in PDF/i
      )
    );
  });

  it('detects EICAR in buffers larger than the stringify threshold', () => {
    const largeBuffer = Buffer.alloc(5 * 1024 * 1024 + 256, 0x20);
    const eicar =
      'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
    largeBuffer.write(eicar, largeBuffer.length - eicar.length - 1, 'latin1');

    expect(scanBufferWithHeuristics(largeBuffer, mockLogger)).toEqual({
      clean: false,
      threat: 'EICAR-Test-File',
    });
  });

  it('implements provider contract', async () => {
    const buffer = Buffer.from('safe', 'utf8');

    await expect(heuristicScanProvider.scan(buffer)).resolves.toEqual({
      clean: true,
    });
  });

  it('heuristicScanProvider.scan propagates threat results for malicious payload', async () => {
    const eicar =
      'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
    const buffer = Buffer.from(eicar, 'latin1');

    await expect(heuristicScanProvider.scan(buffer)).resolves.toEqual({
      clean: false,
      threat: 'EICAR-Test-File',
    });
  });

  it('heuristicScanProvider.scan forwards rejection when scanBufferWithHeuristics throws', async () => {
    const buffer = Buffer.from('any', 'utf8');
    const scanError = new Error('scan failed');
    vi.mocked(scanBufferWithHeuristics).mockImplementationOnce(() => {
      throw scanError;
    });

    await expect(heuristicScanProvider.scan(buffer)).rejects.toThrow(
      'scan failed'
    );
  });

  it('provider uses injected logger when provided', async () => {
    const provider = new HeuristicScanProvider(mockLogger);
    const eicar =
      'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
    const buffer = Buffer.from(eicar, 'latin1');

    await expect(provider.scan(buffer)).resolves.toEqual({
      clean: false,
      threat: 'EICAR-Test-File',
    });
    expect(mockLogger.warn).toHaveBeenCalled();
  });
});
