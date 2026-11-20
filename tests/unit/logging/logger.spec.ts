import { createLogger, logger } from '@/lib/logging/logger';
import { describe, expect, it } from 'vitest';

describe('Logger', () => {
  it('should use silent level in test by default', () => {
    expect(logger.level).toBe('silent');
  });

  describe('createLogger', () => {
    it('returns the shared logger when no context is given', () => {
      expect(createLogger()).toBe(logger);
    });

    it('binds the given context to every log line', () => {
      const contextLogger = createLogger({
        requestId: 'req-123',
        userId: 'user-456',
      });

      expect(contextLogger.bindings()).toMatchObject({
        requestId: 'req-123',
        userId: 'user-456',
      });
    });
  });
});
