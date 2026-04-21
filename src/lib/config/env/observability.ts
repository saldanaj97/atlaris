import { getServerOptional } from '@/lib/config/env/shared';

export const loggingEnv = {
  get level(): string | undefined {
    return getServerOptional('LOG_LEVEL');
  },
} as const;
