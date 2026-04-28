import { vi } from 'vitest';

vi.mock('@/lib/logging/client', () => ({
  clientLogger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));
