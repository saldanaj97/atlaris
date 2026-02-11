import { z } from 'zod';

import { EnvValidationError } from '@/lib/config/env';
import { logger as defaultLogger, type Logger } from '@/lib/logging/logger';
import type { ScanProvider, ScanVerdict } from '@/lib/security/scanner.types';

const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_MAX_POLL_ATTEMPTS = 30;

const SUBMIT_RESPONSE_SCHEMA = z.object({
  data_id: z.string().min(1),
});

const STATUS_RESPONSE_SCHEMA = z.object({
  scan_results: z.object({
    progress_percentage: z.number().min(0).max(100),
    scan_all_result_a: z.string().optional(),
  }),
});

type SubmitResponse = z.infer<typeof SUBMIT_RESPONSE_SCHEMA>;
type StatusResponse = z.infer<typeof STATUS_RESPONSE_SCHEMA>;

export interface MetaDefenderScanProviderOptions {
  apiKey?: string;
  baseUrl: string;
  timeoutMs: number;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
  /** Logger for scan events. Injected in tests; defaults to module logger in production. */
  logger?: Pick<Logger, 'info' | 'error'>;
}

const sleep = async (ms: number): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

function detectContentType(buffer: Buffer): string {
  const signature = buffer.subarray(0, 5).toString('utf8');
  if (signature.startsWith('%PDF-')) {
    return 'application/pdf';
  }
  return 'application/octet-stream';
}

function getErrorMessage(error: Error | string): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function mapVerdict(result: string): ScanVerdict {
  const normalized = result.trim().toLowerCase();
  const cleanTokens = [
    'clean',
    'no threat detected',
    'no threats found',
    'skipped clean',
  ];
  if (cleanTokens.some((token) => normalized === token)) {
    return { clean: true };
  }
  return { clean: false, threat: `MetaDefender-${result}` };
}

export class MetaDefenderScanProvider implements ScanProvider {
  public readonly name = 'metadefender';

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly pollIntervalMs: number;
  private readonly maxPollAttempts: number;
  private readonly log: Pick<Logger, 'info' | 'error'>;

  constructor(options: MetaDefenderScanProviderOptions) {
    const apiKey = options.apiKey?.trim();
    if (!apiKey) {
      throw new EnvValidationError(
        'AV_METADEFENDER_API_KEY is required when AV_PROVIDER=metadefender',
        'AV_METADEFENDER_API_KEY'
      );
    }
    if (options.timeoutMs <= 0) {
      throw new Error('MetaDefender timeoutMs must be greater than 0');
    }
    if (
      options.pollIntervalMs !== undefined &&
      (options.pollIntervalMs <= 0 || !Number.isInteger(options.pollIntervalMs))
    ) {
      throw new Error('MetaDefender pollIntervalMs must be greater than 0');
    }
    if (
      options.maxPollAttempts !== undefined &&
      (options.maxPollAttempts <= 0 ||
        !Number.isInteger(options.maxPollAttempts))
    ) {
      throw new Error('MetaDefender maxPollAttempts must be greater than 0');
    }
    this.apiKey = apiKey;
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.timeoutMs = options.timeoutMs;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.maxPollAttempts = options.maxPollAttempts ?? DEFAULT_MAX_POLL_ATTEMPTS;
    this.log = options.logger ?? defaultLogger;
  }

  public async scan(buffer: Buffer): Promise<ScanVerdict> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      const contentType = detectContentType(buffer);
      const { dataId } = await this.submitFile(buffer, controller.signal, {
        contentType,
        filename: contentType === 'application/pdf' ? 'upload.pdf' : 'upload',
      });
      const verdict = await this.pollForVerdict(dataId, controller.signal);
      const latencyMs = Date.now() - startedAt;

      this.log.info(
        {
          provider: this.name,
          dataId,
          fileSize: buffer.length,
          latencyMs,
          verdict: verdict.clean ? 'clean' : 'infected',
          ...(verdict.clean ? {} : { threat: verdict.threat }),
        },
        'MetaDefender scan completed'
      );

      return verdict;
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      const err = error instanceof Error ? error : new Error(String(error));
      const errorMessage = getErrorMessage(err);

      this.log.error(
        {
          provider: this.name,
          fileSize: buffer.length,
          latencyMs,
          error: errorMessage,
        },
        'MetaDefender scan failed'
      );

      const isAbort = err.name === 'AbortError';
      if (isAbort) {
        throw new Error(
          `MetaDefender scan timed out after ${this.timeoutMs}ms`,
          { cause: err }
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private async submitFile(
    buffer: Buffer,
    signal: AbortSignal,
    options?: { contentType?: string; filename?: string }
  ): Promise<{ dataId: string }> {
    const contentType = options?.contentType ?? 'application/pdf';
    const filename = options?.filename ?? 'upload.pdf';
    const body = new FormData();
    body.append(
      'file',
      new Blob([new Uint8Array(buffer)], { type: contentType }),
      filename
    );

    const response = await fetch(`${this.baseUrl}/file`, {
      method: 'POST',
      headers: {
        apikey: this.apiKey,
      },
      body,
      signal,
    });

    if (!response.ok) {
      throw new Error(
        `MetaDefender submit failed with status ${response.status}`
      );
    }

    const json = SUBMIT_RESPONSE_SCHEMA.safeParse(await response.json());
    if (!json.success) {
      throw new Error('MetaDefender submit response was malformed');
    }

    const payload: SubmitResponse = json.data;
    return { dataId: payload.data_id };
  }

  private async pollForVerdict(
    dataId: string,
    signal: AbortSignal
  ): Promise<ScanVerdict> {
    for (let attempt = 1; attempt <= this.maxPollAttempts; attempt++) {
      const response = await fetch(`${this.baseUrl}/file/${dataId}`, {
        method: 'GET',
        headers: {
          apikey: this.apiKey,
        },
        signal,
      });

      if (!response.ok) {
        throw new Error(
          `MetaDefender status failed with status ${response.status}`
        );
      }

      const json = STATUS_RESPONSE_SCHEMA.safeParse(await response.json());
      if (!json.success) {
        throw new Error('MetaDefender status response was malformed');
      }

      const payload: StatusResponse = json.data;
      const progress = payload.scan_results.progress_percentage;
      const result = payload.scan_results.scan_all_result_a;

      if (progress >= 100) {
        if (!result) {
          throw new Error(
            'MetaDefender scan completed without a verdict response'
          );
        }
        return mapVerdict(result);
      }

      if (attempt < this.maxPollAttempts) {
        await sleep(this.pollIntervalMs);
      }
    }

    throw new Error(
      `MetaDefender scan did not complete after ${this.maxPollAttempts} attempts`
    );
  }
}
