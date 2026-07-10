import { createInMemoryEmailDeliveryLedger } from './in-memory-delivery-ledger';
import { describe, expect, it } from 'vitest';

describe('email delivery ledger claim', () => {
  it('claims a new delivery key', async () => {
    const ledger = createInMemoryEmailDeliveryLedger();
    const result = await ledger.claim({
      userId: 'u1',
      category: 'daily_reminder',
      deliveryKey: '2026-07-09',
    });
    expect(result).toEqual({ outcome: 'claimed', deliveryId: 'd1' });
  });

  it('treats sent as already terminal on the same key', async () => {
    const ledger = createInMemoryEmailDeliveryLedger();
    await ledger.claim({
      userId: 'u1',
      category: 'daily_reminder',
      deliveryKey: '2026-07-09',
    });
    await ledger.markSent('d1', 're_1');

    const again = await ledger.claim({
      userId: 'u1',
      category: 'daily_reminder',
      deliveryKey: '2026-07-09',
    });
    expect(again).toEqual({ outcome: 'already_terminal', status: 'sent' });
  });

  it('reclaims failed deliveries on the same key', async () => {
    const ledger = createInMemoryEmailDeliveryLedger();
    await ledger.claim({
      userId: 'u1',
      category: 'daily_reminder',
      deliveryKey: '2026-07-09',
    });
    await ledger.markFailed('d1', 'provider_error');

    const reclaimed = await ledger.claim({
      userId: 'u1',
      category: 'daily_reminder',
      deliveryKey: '2026-07-09',
    });
    expect(reclaimed).toEqual({ outcome: 'claimed', deliveryId: 'd1' });
  });

  it('skips are terminal', async () => {
    const ledger = createInMemoryEmailDeliveryLedger();
    await ledger.claim({
      userId: 'u1',
      category: 'daily_reminder',
      deliveryKey: '2026-07-09',
    });
    await ledger.markSkipped('d1', 'provider_validation');

    const again = await ledger.claim({
      userId: 'u1',
      category: 'daily_reminder',
      deliveryKey: '2026-07-09',
    });
    expect(again).toEqual({ outcome: 'already_terminal', status: 'skipped' });
  });
});
