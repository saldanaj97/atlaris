import {
  isClientInitialized,
  resetServiceRoleClientForTests,
} from '@supabase/service-role';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});

afterAll(async () => {
  if (isClientInitialized()) {
    await resetServiceRoleClientForTests();
  }
});
