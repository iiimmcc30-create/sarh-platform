/**
 * Backfill butcher ranking scores for all shops.
 * Usage: npx ts-node -r tsconfig-paths/register scripts/recalculate-butcher-rankings.ts
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ButcherRankingService } from '../src/butchers/services/butcher-ranking.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const ranking = app.get(ButcherRankingService);
  const count = await ranking.recalculateAll();
  console.log(`Recalculated ranking for ${count} butcher(s).`);
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
