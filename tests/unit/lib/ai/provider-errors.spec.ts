import { describe, expect, it } from 'vitest';

import {
  ProviderError,
  ProviderInvalidResponseError,
  ProviderNotImplementedError,
  ProviderRateLimitError,
  ProviderTimeoutError,
} from '@/lib/ai/provider';

describe('Provider Error Classes', () => {
  describe('ProviderError', () => {
    it('creates error with kind and message', () => {
      const error = new ProviderError('unknown', 'Test error');

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('ProviderError');
      expect(error.kind).toBe('unknown');
      expect(error.message).toBe('Test error');
    });

    it('supports error cause through options', () => {
      const cause = new Error('Original error');
      const error = new ProviderError('unknown', 'Wrapped error', { cause });

      expect(error.cause).toBe(cause);
    });

    it('handles different error kinds', () => {
      const unknownError = new ProviderError('unknown', 'Unknown error');
      const rateLimitError = new ProviderError('rate_limit', 'Rate limit');
      const timeoutError = new ProviderError('timeout', 'Timeout');
      const invalidResponseError = new ProviderError(
        'invalid_response',
        'Invalid'
      );

      expect(unknownError.kind).toBe('unknown');
      expect(rateLimitError.kind).toBe('rate_limit');
      expect(timeoutError.kind).toBe('timeout');
      expect(invalidResponseError.kind).toBe('invalid_response');
    });

    it('is catchable as generic Error', () => {
      const error = new ProviderError('unknown', 'Test error');

      expect(error instanceof Error).toBe(true);
    });

    it('preserves stack trace', () => {
      const error = new ProviderError('unknown', 'Test error');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('ProviderError');
    });
  });

  describe('ProviderNotImplementedError', () => {
    it('creates error with default message', () => {
      const error = new ProviderNotImplementedError();

      expect(error).toBeInstanceOf(ProviderError);
      expect(error.name).toBe('ProviderNotImplementedError');
      expect(error.message).toBe('AI provider not implemented');
      expect(error.kind).toBe('unknown');
    });

    it('creates error with custom message', () => {
      const error = new ProviderNotImplementedError('Custom message');

      expect(error.message).toBe('Custom message');
    });

    it('inherits from ProviderError', () => {
      const error = new ProviderNotImplementedError();

      expect(error).toBeInstanceOf(ProviderError);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('ProviderRateLimitError', () => {
    it('creates error with default message', () => {
      const error = new ProviderRateLimitError();

      expect(error).toBeInstanceOf(ProviderError);
      expect(error.name).toBe('ProviderRateLimitError');
      expect(error.message).toBe('AI provider rate limit exceeded');
      expect(error.kind).toBe('rate_limit');
    });

    it('creates error with custom message', () => {
      const error = new ProviderRateLimitError('Rate limit exceeded for model X');

      expect(error.message).toBe('Rate limit exceeded for model X');
    });

    it('has correct error kind', () => {
      const error = new ProviderRateLimitError();

      expect(error.kind).toBe('rate_limit');
    });

    it('is distinguishable from other provider errors', () => {
      const rateLimitError = new ProviderRateLimitError();
      const timeoutError = new ProviderTimeoutError();

      expect(rateLimitError.kind).not.toBe(timeoutError.kind);
      expect(rateLimitError.name).not.toBe(timeoutError.name);
    });
  });

  describe('ProviderTimeoutError', () => {
    it('creates error with default message', () => {
      const error = new ProviderTimeoutError();

      expect(error).toBeInstanceOf(ProviderError);
      expect(error.name).toBe('ProviderTimeoutError');
      expect(error.message).toBe('AI provider timed out');
      expect(error.kind).toBe('timeout');
    });

    it('creates error with custom message', () => {
      const error = new ProviderTimeoutError('Request timed out after 30s');

      expect(error.message).toBe('Request timed out after 30s');
    });

    it('has correct error kind', () => {
      const error = new ProviderTimeoutError();

      expect(error.kind).toBe('timeout');
    });

    it('is catchable for retry logic', () => {
      const error = new ProviderTimeoutError();

      expect(error instanceof ProviderTimeoutError).toBe(true);
      expect(error.kind).toBe('timeout');
    });
  });

  describe('ProviderInvalidResponseError', () => {
    it('creates error with default message', () => {
      const error = new ProviderInvalidResponseError();

      expect(error).toBeInstanceOf(ProviderError);
      expect(error.name).toBe('ProviderInvalidResponseError');
      expect(error.message).toBe('AI provider returned an invalid response');
      expect(error.kind).toBe('invalid_response');
    });

    it('creates error with custom message', () => {
      const error = new ProviderInvalidResponseError(
        'Response missing required field: modules'
      );

      expect(error.message).toBe('Response missing required field: modules');
    });

    it('has correct error kind', () => {
      const error = new ProviderInvalidResponseError();

      expect(error.kind).toBe('invalid_response');
    });

    it('is distinguishable for validation failures', () => {
      const invalidResponseError = new ProviderInvalidResponseError();
      const notImplementedError = new ProviderNotImplementedError();

      expect(invalidResponseError.kind).toBe('invalid_response');
      expect(notImplementedError.kind).toBe('unknown');
    });
  });

  describe('Error inheritance chain', () => {
    it('all provider errors extend ProviderError', () => {
      expect(new ProviderNotImplementedError()).toBeInstanceOf(ProviderError);
      expect(new ProviderRateLimitError()).toBeInstanceOf(ProviderError);
      expect(new ProviderTimeoutError()).toBeInstanceOf(ProviderError);
      expect(new ProviderInvalidResponseError()).toBeInstanceOf(ProviderError);
    });

    it('all provider errors extend Error', () => {
      expect(new ProviderError('unknown', 'test')).toBeInstanceOf(Error);
      expect(new ProviderNotImplementedError()).toBeInstanceOf(Error);
      expect(new ProviderRateLimitError()).toBeInstanceOf(Error);
      expect(new ProviderTimeoutError()).toBeInstanceOf(Error);
      expect(new ProviderInvalidResponseError()).toBeInstanceOf(Error);
    });

    it('can be caught by specific error type', () => {
      const error = new ProviderRateLimitError();

      expect(error instanceof ProviderRateLimitError).toBe(true);
      expect(error instanceof ProviderError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });

    it('specific errors do not match other types', () => {
      const rateLimitError = new ProviderRateLimitError();

      expect(rateLimitError instanceof ProviderTimeoutError).toBe(false);
      expect(rateLimitError instanceof ProviderInvalidResponseError).toBe(false);
    });
  });

  describe('Error serialization', () => {
    it('preserves message in JSON serialization', () => {
      const error = new ProviderError('unknown', 'Test error');
      const serialized = JSON.parse(JSON.stringify(error));

      expect(serialized.message).toBe('Test error');
    });

    it('includes name in error string representation', () => {
      const error = new ProviderRateLimitError('Rate limit hit');
      const errorString = error.toString();

      expect(errorString).toContain('ProviderRateLimitError');
      expect(errorString).toContain('Rate limit hit');
    });

    it('can be logged with all properties', () => {
      const error = new ProviderTimeoutError('Timeout after 30s');

      const logObject = {
        name: error.name,
        message: error.message,
        kind: error.kind,
        stack: error.stack,
      };

      expect(logObject.name).toBe('ProviderTimeoutError');
      expect(logObject.message).toBe('Timeout after 30s');
      expect(logObject.kind).toBe('timeout');
      expect(logObject.stack).toBeDefined();
    });
  });

  describe('Error comparison and identification', () => {
    it('can identify error by kind property', () => {
      const errors = [
        new ProviderError('unknown', 'unknown'),
        new ProviderRateLimitError(),
        new ProviderTimeoutError(),
        new ProviderInvalidResponseError(),
      ];

      const rateLimitErrors = errors.filter((e) => e.kind === 'rate_limit');
      const timeoutErrors = errors.filter((e) => e.kind === 'timeout');

      expect(rateLimitErrors).toHaveLength(1);
      expect(timeoutErrors).toHaveLength(1);
      expect(rateLimitErrors[0]).toBeInstanceOf(ProviderRateLimitError);
    });

    it('can identify error by instanceof check', () => {
      const errors = [
        new ProviderRateLimitError(),
        new ProviderTimeoutError(),
        new Error('Generic error'),
      ];

      const providerErrors = errors.filter((e) => e instanceof ProviderError);

      expect(providerErrors).toHaveLength(2);
    });

    it('distinguishes provider errors from generic errors', () => {
      const providerError = new ProviderError('unknown', 'Provider error');
      const genericError = new Error('Generic error');

      expect(providerError instanceof ProviderError).toBe(true);
      expect(genericError instanceof ProviderError).toBe(false);
    });
  });

  describe('Error recovery patterns', () => {
    it('retryable errors can be identified by kind', () => {
      const isRetryable = (error: ProviderError) =>
        error.kind === 'timeout' || error.kind === 'rate_limit';

      expect(isRetryable(new ProviderTimeoutError())).toBe(true);
      expect(isRetryable(new ProviderRateLimitError())).toBe(true);
      expect(isRetryable(new ProviderInvalidResponseError())).toBe(false);
      expect(
        isRetryable(new ProviderError('unknown', 'Unknown error'))
      ).toBe(false);
    });

    it('validation errors can be identified by kind', () => {
      const isValidationError = (error: ProviderError) =>
        error.kind === 'invalid_response';

      expect(isValidationError(new ProviderInvalidResponseError())).toBe(true);
      expect(isValidationError(new ProviderTimeoutError())).toBe(false);
    });

    it('supports custom error classification', () => {
      const classifyError = (error: ProviderError): string => {
        switch (error.kind) {
          case 'rate_limit':
            return 'retryable';
          case 'timeout':
            return 'retryable';
          case 'invalid_response':
            return 'validation';
          default:
            return 'unknown';
        }
      };

      expect(classifyError(new ProviderRateLimitError())).toBe('retryable');
      expect(classifyError(new ProviderTimeoutError())).toBe('retryable');
      expect(classifyError(new ProviderInvalidResponseError())).toBe('validation');
      expect(
        classifyError(new ProviderNotImplementedError())
      ).toBe('unknown');
    });
  });
});