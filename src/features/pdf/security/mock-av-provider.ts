import type {
  ScanProvider,
  ScanVerdict,
} from '@/features/pdf/security/scanner.types';

export type AvMockScenario = 'clean' | 'infected' | 'timeout' | 'malformed';

/**
 * In-process AV mock for local product testing. Runs after heuristic pass when
 * AV_PROVIDER=mock (non-production only).
 */
export class MockAvScanProvider implements ScanProvider {
  readonly name = 'mock';

  constructor(private readonly scenario: AvMockScenario) {}

  async scan(_buffer: Buffer): Promise<ScanVerdict> {
    switch (this.scenario) {
      case 'clean':
        return { clean: true };
      case 'infected':
        return { clean: false, threat: 'mock-eicar' };
      case 'timeout':
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 120_000);
        });
        return { clean: true };
      case 'malformed':
        return { not: 'a-valid-verdict' } as unknown as ScanVerdict;
    }
  }
}
