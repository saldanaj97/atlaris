import {
  claimEmailNotificationDelivery,
  markEmailNotificationDeliveryFailed,
  markEmailNotificationDeliverySent,
  markEmailNotificationDeliverySkipped,
} from '@/lib/db/queries/email-notification-deliveries';

type Status = 'pending' | 'sent' | 'skipped' | 'failed';

/**
 * Tiny in-memory stand-in for the claim/update/select sequence used by the
 * delivery ledger helpers. Enough for unit tests; not a Drizzle emulator.
 */
export function createInMemoryEmailDeliveryLedger() {
  const rows = new Map<
    string,
    {
      id: string;
      status: Status;
      providerMessageId: string | null;
      failureClass: string | null;
    }
  >();

  const keyOf = (userId: string, category: string, deliveryKey: string) =>
    `${userId}|${category}|${deliveryKey}`;

  let seq = 0;

  const db = {
    insert() {
      return {
        values(value: {
          userId: string;
          category: string;
          deliveryKey: string;
          status: Status;
        }) {
          return {
            onConflictDoNothing() {
              return {
                async returning() {
                  const key = keyOf(
                    value.userId,
                    value.category,
                    value.deliveryKey,
                  );
                  if (rows.has(key)) {
                    return [];
                  }
                  seq += 1;
                  const id = `d${seq}`;
                  rows.set(key, {
                    id,
                    status: value.status,
                    providerMessageId: null,
                    failureClass: null,
                  });
                  return [{ id }];
                },
              };
            },
          };
        },
      };
    },
    update() {
      return {
        set(patch: {
          status?: Status;
          providerMessageId?: string | null;
          failureClass?: string | null;
        }) {
          return {
            where(condition: { __key?: string; __id?: string }) {
              const apply = () => {
                if (condition.__id) {
                  for (const row of rows.values()) {
                    if (row.id === condition.__id) {
                      Object.assign(row, patch);
                      return row;
                    }
                  }
                  return null;
                }
                if (condition.__key) {
                  const row = rows.get(condition.__key);
                  if (!row) return null;
                  if (patch.status === 'pending' && row.status !== 'failed') {
                    return null;
                  }
                  if (patch.status === 'pending' && row.status === 'failed') {
                    Object.assign(row, patch);
                    return row;
                  }
                  Object.assign(row, patch);
                  return row;
                }
                return null;
              };

              const promise = Promise.resolve().then(() => {
                apply();
              });

              return Object.assign(promise, {
                async returning() {
                  const row = apply();
                  return row ? [{ id: row.id }] : [];
                },
              });
            },
          };
        },
      };
    },
    select() {
      return {
        from() {
          return {
            async where(condition: { __key?: string }) {
              if (!condition.__key) return [];
              const row = rows.get(condition.__key);
              return row ? [{ status: row.status }] : [];
            },
          };
        },
      };
    },
    execute: async () => undefined,
  };

  // Helpers pass drizzle eq()/and() objects. Intercept by patching eq/and usage
  // would couple to drizzle; instead expose a shim used only by tests that
  // monkey-patches the claim helpers' conditions through Symbol tags.
  return {
    db,
    rows,
    keyOf,
    async claim(args: {
      userId: string;
      category: 'weekly_summary' | 'daily_reminder' | 'streak_reminder';
      deliveryKey: string;
    }) {
      const key = keyOf(args.userId, args.category, args.deliveryKey);
      const originalUpdate = db.update.bind(db);
      const originalSelect = db.select.bind(db);

      db.update = () =>
        ({
          set: (patch: {
            status?: Status;
            providerMessageId?: string | null;
            failureClass?: string | null;
          }) => ({
            where: () => {
              const apply = () => {
                const row = rows.get(key);
                if (!row) return null;
                if (patch.status === 'pending') {
                  if (row.status !== 'failed') return null;
                  Object.assign(row, patch);
                  return row;
                }
                Object.assign(row, patch);
                return row;
              };
              return Object.assign(
                Promise.resolve().then(() => apply()),
                {
                  async returning() {
                    const row = apply();
                    return row ? [{ id: row.id }] : [];
                  },
                },
              );
            },
          }),
        }) as never;

      db.select = () =>
        ({
          from: () => ({
            where: async () => {
              const row = rows.get(key);
              return row ? [{ status: row.status }] : [];
            },
          }),
        }) as never;

      try {
        return await claimEmailNotificationDelivery(args, db as never);
      } finally {
        db.update = originalUpdate;
        db.select = originalSelect;
      }
    },
    async markSent(deliveryId: string, providerMessageId: string | null) {
      const originalUpdate = db.update.bind(db);
      db.update = () =>
        ({
          set: (
            patch: Partial<{
              status: Status;
              providerMessageId: string | null;
              failureClass: string | null;
            }>,
          ) => ({
            where: () => {
              for (const row of rows.values()) {
                if (row.id === deliveryId) Object.assign(row, patch);
              }
              return Promise.resolve();
            },
          }),
        }) as never;
      try {
        await markEmailNotificationDeliverySent(
          deliveryId,
          providerMessageId,
          db as never,
        );
      } finally {
        db.update = originalUpdate;
      }
    },
    async markFailed(deliveryId: string, failureClass: string) {
      const originalUpdate = db.update.bind(db);
      db.update = () =>
        ({
          set: (
            patch: Partial<{
              status: Status;
              failureClass: string | null;
            }>,
          ) => ({
            where: () => {
              for (const row of rows.values()) {
                if (row.id === deliveryId) Object.assign(row, patch);
              }
              return Promise.resolve();
            },
          }),
        }) as never;
      try {
        await markEmailNotificationDeliveryFailed(
          deliveryId,
          failureClass,
          db as never,
        );
      } finally {
        db.update = originalUpdate;
      }
    },
    async markSkipped(deliveryId: string, failureClass: string) {
      const originalUpdate = db.update.bind(db);
      db.update = () =>
        ({
          set: (
            patch: Partial<{
              status: Status;
              failureClass: string | null;
            }>,
          ) => ({
            where: () => {
              for (const row of rows.values()) {
                if (row.id === deliveryId) Object.assign(row, patch);
              }
              return Promise.resolve();
            },
          }),
        }) as never;
      try {
        await markEmailNotificationDeliverySkipped(
          deliveryId,
          failureClass,
          db as never,
        );
      } finally {
        db.update = originalUpdate;
      }
    },
  };
}
