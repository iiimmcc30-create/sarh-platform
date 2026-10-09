/**
 * On-demand run of the boot task: seed "SaudiCity" from assets/geo/saudi-cities.json
 * and give listings without geo a city centre from their text location.
 * Never overwrites GPS points. Usage: npm run geo:backfill  (needs DATABASE_URL)
 */
import { PrismaService } from '../src/prisma/prisma.service';
import { SaudiCitiesService } from '../src/geo/saudi-cities.service';
import { ListingGeoBackfillService } from '../src/geo/listing-geo-backfill.service';

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const cities = new SaudiCitiesService(prisma);
    const seeded = await cities.seed();
    console.log(seeded ? `Seeded ${seeded.upserted} cities (v${seeded.version})` : 'Cities already seeded');
    const result = await new ListingGeoBackfillService(prisma, cities).backfill();
    console.log(`Backfilled ${result.updated} listings`);
    if (result.unmatched.length) {
      console.log(`Unmatched (${result.unmatched.length}):`);
      for (const u of result.unmatched) console.log(`  ${u.id}  ${u.text}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
