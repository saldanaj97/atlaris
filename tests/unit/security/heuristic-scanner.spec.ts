import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createHeuristicScanProvider,
  getDefaultHeuristicScanProvider,
  HeuristicScanProvider,
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

    await expect(
      getDefaultHeuristicScanProvider().scan(buffer)
    ).resolves.toEqual({
      clean: true,
    });
  });

  it('getDefaultHeuristicScanProvider().scan propagates threat results for malicious payload', async () => {
    const eicar =
      'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
    const buffer = Buffer.from(eicar, 'latin1');

    await expect(
      getDefaultHeuristicScanProvider().scan(buffer)
    ).resolves.toEqual({
      clean: false,
      threat: 'EICAR-Test-File',
    });
  });

  it('provider uses injected logger when provided via constructor', async () => {
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

  it('createHeuristicScanProvider(mockLogger) uses injected logger', async () => {
    const provider = createHeuristicScanProvider(mockLogger);
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
