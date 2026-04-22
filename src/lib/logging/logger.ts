import pino, { type LoggerOptions, stdTimeFunctions } from 'pino';
import { appEnv, loggingEnv } from '@/lib/config/env';

export type Logger = import('pino').Logger;

const level = loggingEnv.level ?? (appEnv.isProduction ? 'info' : 'debug');

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
