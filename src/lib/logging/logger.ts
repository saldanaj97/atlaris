import pino, {
  stdTimeFunctions,
  type Logger as PinoLogger,
  type LoggerOptions,
} from 'pino';
import { appEnv, loggingEnv } from '@/lib/config/env';

const level = loggingEnv.level ?? (appEnv.isProduction ? 'info' : 'debug');

export type Logger = PinoLogger;

const loggerOptions: LoggerOptions = {
  level,
  base: {
    env: appEnv.nodeEnv,
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: stdTimeFunctions.isoTime,
};

export const logger = pino(loggerOptions);

export function createLogger(context?: Record<string, unknown>): Logger {
  return context ? logger.child(context) : logger;
}
