export type ModelResolutionErrorCode = 'PROVIDER_INIT_FAILED';

type ModelResolutionErrorOptions = {
  code?: ModelResolutionErrorCode;
  details?: unknown;
  cause?: unknown;
};

export class ModelResolutionError extends Error {
  public readonly code: ModelResolutionErrorCode;
  public readonly details?: unknown;

  constructor(
    message = 'Provider initialization failed.',
    options: ModelResolutionErrorOptions = {}
  ) {
    super(
      message,
      options.cause != null ? { cause: options.cause } : undefined
    );
    this.name = 'ModelResolutionError';
    this.code = options.code ?? 'PROVIDER_INIT_FAILED';
    this.details = options.details;
  }
}
