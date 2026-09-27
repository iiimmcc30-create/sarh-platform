const { PrismaClient } = require('@prisma/client');

(async () => {
  const prisma = new PrismaClient();
  try {
    const cols = await prisma.$queryRaw`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'Listing' AND column_name = 'weightKg'
    `;
    const failed = await prisma.$queryRaw`
      SELECT migration_name, finished_at, rolled_back_at, logs
      FROM "_prisma_migrations"
      WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL
      ORDER BY started_at DESC
      LIMIT 5
    `;
    console.log(JSON.stringify({ weightKg: cols, failed }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
