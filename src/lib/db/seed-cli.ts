#!/usr/bin/env tsx

/**
 * Database seeding CLI script
 *
 * Usage:
 *   pnpm seed           # Seed development database (small dataset)
 *   pnpm seed:reset     # Reset database only
 *   pnpm seed:custom    # Custom seeding with options
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { resetDatabase, seedDatabase, seedDevelopment } from './seed';

const LOCAL_DATABASE_URL =
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function main() {
  const command = process.argv[2] || 'development';

  // Validate environment variables
  if (!LOCAL_DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }

  console.log('🔌 Connecting to database...');

  // Create database connection
  const client = postgres(LOCAL_DATABASE_URL);
  const db = drizzle(client);

  try {
    switch (command) {
      case 'development':
        console.log('🌱 Seeding development database...');
        await seedDevelopment(db);
        break;

      case 'reset':
        console.log('🗑️  Resetting database...');
        await resetDatabase(db);
        break;

      case 'custom':
        const userCount = parseInt(process.argv[3]) || 20;
        const planCount = parseInt(process.argv[4]) || 60;
        const resourceCount = parseInt(process.argv[5]) || 200;
        const shouldReset = process.argv[6] === 'true';
        const seedValue = parseInt(process.argv[7]) || 12345;

        console.log(
          `🌱 Custom seeding: ${userCount} users, ${planCount} plans, ${resourceCount} resources`
        );
        await seedDatabase(db, {
          userCount,
          planCount,
          resourceCount,
          reset: shouldReset,
          seed: seedValue,
        });
        break;

      default:
        console.log(`
Usage: pnpm seed [command]

Commands:
  dev          Seed development database (10 users, 25 plans, 100 resources)
  reset        Reset database (clear all data)
  custom       Custom seeding: pnpm seed custom [users] [plans] [resources] [reset]

Examples:
  pnpm seed dev
  pnpm seed reset
  pnpm seed custom 50 150 500 true
        `);
        process.exit(0);
    }

    console.log('✅ Seeding completed successfully!');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔌 Database connection closed');
  }
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
