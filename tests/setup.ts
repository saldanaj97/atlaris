import { cleanup } from '@testing-library/react';
import { afterAll, afterEach } from 'vitest';
import {
  isClientInitialized,
  resetServiceRoleClientForTests,
} from '@/lib/db/service-role';

afterEach(() => {
  cleanup();
});

afterAll(async () => {
  if (isClientInitialized()) {
    await resetServiceRoleClientForTests();
  }
});
