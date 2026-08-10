import { truncateAll } from '../helpers/db/truncate';
import {
  cleanupTrackedRlsClients,
  createAnonRlsDb,
  createRlsDbForUser,
} from '../helpers/rls';
import { expectRlsViolation } from './rls-test-helpers';
import { emailNotificationDeliveryRuns } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { afterEach, beforeEach, describe, it } from 'vitest';

describe('email notification delivery run RLS', () => {
  beforeEach(async () => {
    await cleanupTrackedRlsClients();
    await truncateAll();
  });

  afterEach(async () => {
    await cleanupTrackedRlsClients();
  });

  it('denies reads and writes to anonymous and authenticated clients', async () => {
    await db.insert(emailNotificationDeliveryRuns).values({
      runKind: 'daily',
      schedulerDateUtc: '2026-07-10',
      referenceTimestampUtc: new Date('2026-07-10T14:00:00.000Z'),
    });

    const anonDb = await createAnonRlsDb();
    const authenticatedDb = await createRlsDbForUser('delivery-run-reader');

    await expectRlsViolation(() =>
      anonDb.select().from(emailNotificationDeliveryRuns),
    );
    await expectRlsViolation(() =>
      authenticatedDb.select().from(emailNotificationDeliveryRuns),
    );
    await expectRlsViolation(() =>
      authenticatedDb.insert(emailNotificationDeliveryRuns).values({
        runKind: 'weekly',
        schedulerDateUtc: '2026-07-13',
        referenceTimestampUtc: new Date('2026-07-13T14:30:00.000Z'),
      }),
    );
  });
});
