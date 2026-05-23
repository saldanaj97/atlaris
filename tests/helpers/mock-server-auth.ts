import { vi } from 'vitest';

export type MockServerSessionUser =
  | string
  | {
      id: string;
      email?: string;
      name?: string;
    };

export function mockServerSession(
  getSession: ReturnType<typeof vi.fn>,
  user: MockServerSessionUser,
): void {
  const userPayload = typeof user === 'string' ? { id: user } : user;
  getSession.mockResolvedValue({
    data: { user: userPayload },
  });
}
