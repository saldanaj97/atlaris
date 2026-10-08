import { describe, expect, it, vi } from 'vitest';

// tests/unit/setup.ts replaces `db` with a stub; this spec needs the real proxy.
const serviceRole = await vi.importActual<
  typeof import('@supabase/service-role')
>('@supabase/service-role');

function fakeClient(label: string) {
  return { label, select: vi.fn(() => label) } as unknown as Parameters<
    typeof serviceRole.runWithServiceRoleDb
  >[0];
}

describe('runWithServiceRoleDb', () => {
  it('resolves the service-role db export to the scoped client', () => {
    const client = fakeClient('invocation');

    const result = serviceRole.runWithServiceRoleDb(client, () =>
      Reflect.get(serviceRole.db, 'label'),
    );

    expect(result).toBe('invocation');
    expect(serviceRole.isClientInitialized()).toBe(false);
  });

  it('keeps concurrent scopes apart across awaits', async () => {
    const read = async (label: string) =>
      serviceRole.runWithServiceRoleDb(fakeClient(label), async () => {
        await new Promise((resolve) =>
          setTimeout(resolve, label === 'a' ? 10 : 0),
        );
        return Reflect.get(serviceRole.db, 'label');
      });

    await expect(Promise.all([read('a'), read('b')])).resolves.toEqual([
      'a',
      'b',
    ]);
  });

  it('keeps the service-role marker inside and outside a scope', () => {
    expect(serviceRole.isServiceRoleDbClient(serviceRole.db)).toBe(true);
    expect(
      serviceRole.runWithServiceRoleDb(fakeClient('x'), () =>
        serviceRole.isServiceRoleDbClient(serviceRole.db),
      ),
    ).toBe(true);
    expect(serviceRole.isClientInitialized()).toBe(false);
  });
});
