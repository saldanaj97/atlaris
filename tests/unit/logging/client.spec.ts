import { spyOnConsole } from '@tests/helpers/console-spy';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clientLogger } from '@/lib/logging/client';

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

  describe('error', () => {
    it('should call console.error', () => {
      clientLogger.error('Error message');
      expect(consoleError.spy).toHaveBeenCalledWith('Error message');
    });

    it('should accept multiple arguments', () => {
      clientLogger.error('Error:', 'Something went wrong', { code: 500 });
      expect(consoleError.spy).toHaveBeenCalledWith(
        'Error:',
        'Something went wrong',
        { code: 500 }
      );
    });

    it('should handle Error objects', () => {
      const error = new Error('Test error');
      clientLogger.error('An error occurred:', error);
      expect(consoleError.spy).toHaveBeenCalledWith(
        'An error occurred:',
        error
      );
    });

    it('should fallback to console.log if console.error is missing', () => {
      // Temporarily remove console.error
      Reflect.set(console, 'error', undefined);

      clientLogger.error('Error message');
      expect(consoleLog.spy).toHaveBeenCalledWith('Error message');
    });
  });

  describe('warn', () => {
    it('should call console.warn', () => {
      clientLogger.warn('Warning message');
      expect(consoleWarn.spy).toHaveBeenCalledWith('Warning message');
    });

    it('should accept multiple arguments', () => {
      clientLogger.warn('Warning:', 'Deprecated feature', {
        feature: 'old-api',
      });
      expect(consoleWarn.spy).toHaveBeenCalledWith(
        'Warning:',
        'Deprecated feature',
        { feature: 'old-api' }
      );
    });

    it('should fallback to console.log if console.warn is missing', () => {
      // Temporarily remove console.warn
      Reflect.set(console, 'warn', undefined);

      clientLogger.warn('Warning message');
      expect(consoleLog.spy).toHaveBeenCalledWith('Warning message');
    });
  });

  describe('info', () => {
    it('should call console.info', () => {
      clientLogger.info('Info message');
      expect(consoleInfo.spy).toHaveBeenCalledWith('Info message');
    });

    it('should accept multiple arguments', () => {
      clientLogger.info('User action:', 'Button clicked', {
        buttonId: 'submit',
      });
      expect(consoleInfo.spy).toHaveBeenCalledWith(
        'User action:',
        'Button clicked',
        { buttonId: 'submit' }
      );
    });

    it('should fallback to console.log if console.info is missing', () => {
      // Temporarily remove console.info
      Reflect.set(console, 'info', undefined);

      clientLogger.info('Info message');
      expect(consoleLog.spy).toHaveBeenCalledWith('Info message');
    });
  });

  describe('debug', () => {
    it('should call console.debug', () => {
      clientLogger.debug('Debug message');
      expect(consoleDebug.spy).toHaveBeenCalledWith('Debug message');
    });

    it('should accept multiple arguments', () => {
      clientLogger.debug('Debug:', 'Component rendered', { count: 5 });
      expect(consoleDebug.spy).toHaveBeenCalledWith(
        'Debug:',
        'Component rendered',
        { count: 5 }
      );
    });

    it('should fallback to console.log if console.debug is missing', () => {
      // Temporarily remove console.debug
      Reflect.set(console, 'debug', undefined);

      clientLogger.debug('Debug message');
      expect(consoleLog.spy).toHaveBeenCalledWith('Debug message');
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
      expect(consoleError.spy).toHaveBeenCalledWith(undefined);
    });

    it('should handle null arguments', () => {
      clientLogger.warn(null);
      expect(consoleWarn.spy).toHaveBeenCalledWith(null);
    });

    it('should handle objects', () => {
      const obj = { key: 'value', nested: { data: 123 } };
      clientLogger.info(obj);
      expect(consoleInfo.spy).toHaveBeenCalledWith(obj);
    });

    it('should handle arrays', () => {
      const arr = [1, 2, 3, 'test'];
      clientLogger.debug(arr);
      expect(consoleDebug.spy).toHaveBeenCalledWith(arr);
    });

    it('should handle numbers', () => {
      clientLogger.info(42);
      expect(consoleInfo.spy).toHaveBeenCalledWith(42);
    });

    it('should handle booleans', () => {
      clientLogger.debug(true);
      expect(consoleDebug.spy).toHaveBeenCalledWith(true);
    });

    it('should handle symbols', () => {
      const sym = Symbol('test');
      clientLogger.info(sym);
      expect(consoleInfo.spy).toHaveBeenCalledWith(sym);
    });
  });

  describe('mixed argument types', () => {
    it('should handle string and object', () => {
      clientLogger.error('Error occurred', {
        code: 500,
        message: 'Internal error',
      });
      expect(consoleError.spy).toHaveBeenCalledWith('Error occurred', {
        code: 500,
        message: 'Internal error',
      });
    });

    it('should handle multiple strings', () => {
      clientLogger.warn('Warning:', 'This feature is deprecated');
      expect(consoleWarn.spy).toHaveBeenCalledWith(
        'Warning:',
        'This feature is deprecated'
      );
    });

    it('should handle string, number, and object', () => {
      clientLogger.info('User', 123, { action: 'login' });
      expect(consoleInfo.spy).toHaveBeenCalledWith('User', 123, {
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
