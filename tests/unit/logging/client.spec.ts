import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { clientLogger } from '@/lib/logging/client';

describe('Client Logger', () => {
  let consoleErrorSpy: any;
  let consoleWarnSpy: any;
  let consoleInfoSpy: any;
  let consoleDebugSpy: any;
  let consoleLogSpy: any;

  beforeEach(() => {
    // Spy on console methods
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('error', () => {
    it('should call console.error', () => {
      clientLogger.error('Error message');
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error message');
    });

    it('should accept multiple arguments', () => {
      clientLogger.error('Error:', 'Something went wrong', { code: 500 });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error:',
        'Something went wrong',
        { code: 500 }
      );
    });

    it('should handle Error objects', () => {
      const error = new Error('Test error');
      clientLogger.error('An error occurred:', error);
      expect(consoleErrorSpy).toHaveBeenCalledWith('An error occurred:', error);
    });

    it('should fallback to console.log if console.error is missing', () => {
      // Temporarily remove console.error
      const originalError = console.error;
      (console as any).error = undefined;

      clientLogger.error('Error message');
      expect(consoleLogSpy).toHaveBeenCalledWith('Error message');

      // Restore console.error
      console.error = originalError;
    });
  });

  describe('warn', () => {
    it('should call console.warn', () => {
      clientLogger.warn('Warning message');
      expect(consoleWarnSpy).toHaveBeenCalledWith('Warning message');
    });

    it('should accept multiple arguments', () => {
      clientLogger.warn('Warning:', 'Deprecated feature', {
        feature: 'old-api',
      });
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Warning:',
        'Deprecated feature',
        { feature: 'old-api' }
      );
    });

    it('should fallback to console.log if console.warn is missing', () => {
      // Temporarily remove console.warn
      const originalWarn = console.warn;
      (console as any).warn = undefined;

      clientLogger.warn('Warning message');
      expect(consoleLogSpy).toHaveBeenCalledWith('Warning message');

      // Restore console.warn
      console.warn = originalWarn;
    });
  });

  describe('info', () => {
    it('should call console.info', () => {
      clientLogger.info('Info message');
      expect(consoleInfoSpy).toHaveBeenCalledWith('Info message');
    });

    it('should accept multiple arguments', () => {
      clientLogger.info('User action:', 'Button clicked', {
        buttonId: 'submit',
      });
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        'User action:',
        'Button clicked',
        { buttonId: 'submit' }
      );
    });

    it('should fallback to console.log if console.info is missing', () => {
      // Temporarily remove console.info
      const originalInfo = console.info;
      (console as any).info = undefined;

      clientLogger.info('Info message');
      expect(consoleLogSpy).toHaveBeenCalledWith('Info message');

      // Restore console.info
      console.info = originalInfo;
    });
  });

  describe('debug', () => {
    it('should call console.debug', () => {
      clientLogger.debug('Debug message');
      expect(consoleDebugSpy).toHaveBeenCalledWith('Debug message');
    });

    it('should accept multiple arguments', () => {
      clientLogger.debug('Debug:', 'Component rendered', { count: 5 });
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        'Debug:',
        'Component rendered',
        { count: 5 }
      );
    });

    it('should fallback to console.log if console.debug is missing', () => {
      // Temporarily remove console.debug
      const originalDebug = console.debug;
      (console as any).debug = undefined;

      clientLogger.debug('Debug message');
      expect(consoleLogSpy).toHaveBeenCalledWith('Debug message');

      // Restore console.debug
      console.debug = originalDebug;
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

    it('should handle undefined arguments', () => {
      clientLogger.error(undefined);
      expect(consoleErrorSpy).toHaveBeenCalledWith(undefined);
    });

    it('should handle null arguments', () => {
      clientLogger.warn(null);
      expect(consoleWarnSpy).toHaveBeenCalledWith(null);
    });

    it('should handle objects', () => {
      const obj = { key: 'value', nested: { data: 123 } };
      clientLogger.info(obj);
      expect(consoleInfoSpy).toHaveBeenCalledWith(obj);
    });

    it('should handle arrays', () => {
      const arr = [1, 2, 3, 'test'];
      clientLogger.debug(arr);
      expect(consoleDebugSpy).toHaveBeenCalledWith(arr);
    });

    it('should handle numbers', () => {
      clientLogger.info(42);
      expect(consoleInfoSpy).toHaveBeenCalledWith(42);
    });

    it('should handle booleans', () => {
      clientLogger.debug(true);
      expect(consoleDebugSpy).toHaveBeenCalledWith(true);
    });

    it('should handle symbols', () => {
      const sym = Symbol('test');
      clientLogger.info(sym);
      expect(consoleInfoSpy).toHaveBeenCalledWith(sym);
    });
  });

  describe('mixed argument types', () => {
    it('should handle string and object', () => {
      clientLogger.error('Error occurred', {
        code: 500,
        message: 'Internal error',
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error occurred', {
        code: 500,
        message: 'Internal error',
      });
    });

    it('should handle multiple strings', () => {
      clientLogger.warn('Warning:', 'This feature is deprecated');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Warning:',
        'This feature is deprecated'
      );
    });

    it('should handle string, number, and object', () => {
      clientLogger.info('User', 123, { action: 'login' });
      expect(consoleInfoSpy).toHaveBeenCalledWith('User', 123, {
        action: 'login',
      });
    });
  });

  describe('logger methods exist', () => {
    it('should have error method', () => {
      expect(typeof clientLogger.error).toBe('function');
    });

    it('should have warn method', () => {
      expect(typeof clientLogger.warn).toBe('function');
    });

    it('should have info method', () => {
      expect(typeof clientLogger.info).toBe('function');
    });

    it('should have debug method', () => {
      expect(typeof clientLogger.debug).toBe('function');
    });
  });

  describe('logger structure', () => {
    it('should have exactly 4 methods', () => {
      const methods = Object.keys(clientLogger);
      expect(methods.length).toBe(4);
      expect(methods).toContain('error');
      expect(methods).toContain('warn');
      expect(methods).toContain('info');
      expect(methods).toContain('debug');
    });

    it('should be an object', () => {
      expect(typeof clientLogger).toBe('object');
      expect(clientLogger).not.toBeNull();
    });
  });

  describe('console fallback behavior', () => {
    it('should always use console.log as ultimate fallback', () => {
      // Remove all console methods except log
      const originalError = console.error;
      const originalWarn = console.warn;
      const originalInfo = console.info;
      const originalDebug = console.debug;

      (console as any).error = undefined;
      (console as any).warn = undefined;
      (console as any).info = undefined;
      (console as any).debug = undefined;

      clientLogger.error('error');
      clientLogger.warn('warn');
      clientLogger.info('info');
      clientLogger.debug('debug');

      expect(consoleLogSpy).toHaveBeenCalledTimes(4);
      expect(consoleLogSpy).toHaveBeenCalledWith('error');
      expect(consoleLogSpy).toHaveBeenCalledWith('warn');
      expect(consoleLogSpy).toHaveBeenCalledWith('info');
      expect(consoleLogSpy).toHaveBeenCalledWith('debug');

      // Restore console methods
      console.error = originalError;
      console.warn = originalWarn;
      console.info = originalInfo;
      console.debug = originalDebug;
    });
  });
});
