import { vi } from 'vitest';

export type MockServerSessionUser =
  | string
  | {
      id: string;
      email?: string;
      name?: string;
      clerkUserUpdatedAt?: Date;
    };

export function mockServerSession(
  getSession: ReturnType<typeof vi.fn>,
  user: MockServerSessionUser,
): void {
  const userPayload =
    typeof user === 'string'
      ? { id: user, clerkUserUpdatedAt: new Date('2026-08-05T00:00:00.000Z') }
      : {
          clerkUserUpdatedAt: new Date('2026-08-05T00:00:00.000Z'),
          ...user,
        };
  getSession.mockResolvedValue({
    data: { user: userPayload },
  });
}
