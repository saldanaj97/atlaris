export type ScanVerdict = { clean: true } | { clean: false; threat: string };

export interface ScanProvider {
  /** Human-readable provider identifier for logs and metrics. */
  readonly name: string;
  /** Scans a file buffer and returns a clean/infected verdict. */
  scan(buffer: Buffer): Promise<ScanVerdict>;
}
