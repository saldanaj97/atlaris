import { clientLogger } from '@/lib/logging/client';
import * as Sentry from '@sentry/nextjs';
import { spyOnConsole } from '@tests/helpers/console-spy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('@/lib/logging/client');

describe('Client Logger', () => {
  let consoleError: ReturnType<typeof spyOnConsole>;
  let consoleWarn: ReturnType<typeof spyOnConsole>;
  let consoleInfo: ReturnType<typeof spyOnConsole>;
  let consoleDebug: ReturnType<typeof spyOnConsole>;
  let consoleLog: ReturnType<typeof spyOnConsole>;

  beforeEach(() => {
    consoleError = spyOnConsole('error');
    consoleWarn = spyOnConsole('warn');
    consoleInfo = spyOnConsole('info');
    consoleDebug = spyOnConsole('debug');
    consoleLog = spyOnConsole('log');
  });

  afterEach(() => {
    consoleError.restore();
    consoleWarn.restore();
    consoleInfo.restore();
    consoleDebug.restore();
    consoleLog.restore();
  });

  it.each(['error', 'warn', 'info', 'debug'] as const)(
    'forwards %s logs and attributes to Sentry',
    (level) => {
      const sentryLog = vi
        .spyOn(Sentry.logger, level)
        .mockImplementation(() => {});
      const attributes = { requestId: 'request-1' };
      try {
        clientLogger[level]('Request handled', attributes);
        expect(sentryLog).toHaveBeenCalledWith('Request handled', attributes);
      } finally {
        sentryLog.mockRestore();
      }
    },
  );

  describe('error', () => {
    it('should accept multiple arguments', () => {
      clientLogger.error('Error:', 'Something went wrong', { code: 500 });
      expect(consoleError.spy).toHaveBeenCalledWith(
        'Error:',
        'Something went wrong',
        { code: 500 },
      );
    });
  });

  describe('warn', () => {
    it('should accept multiple arguments', () => {
      clientLogger.warn('Warning:', 'Deprecated feature', {
        feature: 'old-api',
      });
      expect(consoleWarn.spy).toHaveBeenCalledWith(
        'Warning:',
        'Deprecated feature',
        { feature: 'old-api' },
      );
    });
  });

  describe('info', () => {
    it('should accept multiple arguments', () => {
      clientLogger.info('User action:', 'Button clicked', {
        buttonId: 'submit',
      });
      expect(consoleInfo.spy).toHaveBeenCalledWith(
        'User action:',
        'Button clicked',
        { buttonId: 'submit' },
      );
    });
  });

  describe('debug', () => {
    it('should accept multiple arguments', () => {
      clientLogger.debug('Debug:', 'Component rendered', { count: 5 });
      expect(consoleDebug.spy).toHaveBeenCalledWith(
        'Debug:',
        'Component rendered',
        { count: 5 },
      );
    });
  });

  describe('general behavior', () => {
    it('should handle no arguments', () => {
      expect(() => {
        clientLogger.error();
        clientLogger.warn();
        clientLogger.info();
        clientLogger.debug();
      }).not.toThrow();
    });

    it('should handle symbols', () => {
      const sym = Symbol('test');
      clientLogger.info(sym);
      expect(consoleInfo.spy).toHaveBeenCalledWith(sym);
    });
  });

  describe('console fallback behavior', () => {
    it('should always use console.log as ultimate fallback', () => {
      // Remove all console methods except log
      Reflect.set(console, 'error', undefined);
      Reflect.set(console, 'warn', undefined);
      Reflect.set(console, 'info', undefined);
      Reflect.set(console, 'debug', undefined);

      clientLogger.error('error');
      clientLogger.warn('warn');
      clientLogger.info('info');
      clientLogger.debug('debug');

      expect(consoleLog.spy).toHaveBeenCalledTimes(4);
      expect(consoleLog.spy).toHaveBeenCalledWith('error');
      expect(consoleLog.spy).toHaveBeenCalledWith('warn');
      expect(consoleLog.spy).toHaveBeenCalledWith('info');
      expect(consoleLog.spy).toHaveBeenCalledWith('debug');
    });
  });
});
