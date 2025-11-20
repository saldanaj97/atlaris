import { vi } from 'vitest';

export const createGoogleApisMock = () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({
        setCredentials: vi.fn(),
      })),
    },
    calendar: vi.fn().mockReturnValue({
      events: {
        insert: vi.fn().mockResolvedValue({
          data: { id: 'event_123', status: 'confirmed' },
        }),
      },
    }),
  },
});
