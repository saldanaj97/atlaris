import {
  dropNativeSmokeDatabase,
  smokeDatabaseName,
} from '@tests/helpers/smoke/native-smoke-database';
import { dropDatabase } from '@tests/setup/db-provisioning';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tests/setup/db-provisioning', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tests/setup/db-provisioning')>()),
  dropDatabase: vi.fn(async () => undefined),
}));
vi.mock('@tests/setup/native-test-stack', () => ({
  startNativeTestStack: vi.fn(),
}));

const STACK = 'postgresql://postgres:postgres@127.0.0.1:54322';

describe('dropNativeSmokeDatabase', () => {
  it('drops the smoke database the URL names', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await dropNativeSmokeDatabase(
      `${STACK}/atlaris_verify_smoke_1792790000000`,
    );

    expect(dropDatabase).toHaveBeenCalledWith(
      `${STACK}/postgres`,
      'atlaris_verify_smoke_1792790000000',
    );
  });

  it.each(['postgres', 'atlaris', 'atlaris_test_smoke_x'])(
    'refuses to drop %s',
    (name) => {
      expect(() => smokeDatabaseName(`${STACK}/${name}`)).toThrow(
        /not a smoke database/,
      );
    },
  );

  it('does nothing without a URL', async () => {
    vi.mocked(dropDatabase).mockClear();

    await dropNativeSmokeDatabase(null);

    expect(dropDatabase).not.toHaveBeenCalled();
  });
});
