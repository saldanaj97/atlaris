import { vi } from 'vitest';

let mockEventCounter = 0;

export function resetMockEventCounter() {
  mockEventCounter = 0;
}

export function getMockEventCounter() {
  return mockEventCounter;
}

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({
        setCredentials: vi.fn(),
      })),
    },
    calendar: vi.fn(() => ({
      events: {
        insert: vi.fn().mockImplementation(() => {
          mockEventCounter++;
          return Promise.resolve({
            data: { id: `event_${mockEventCounter}`, status: 'confirmed' },
          });
        }),
        delete: vi.fn().mockResolvedValue({}),
      },
    })),
  },
}));
