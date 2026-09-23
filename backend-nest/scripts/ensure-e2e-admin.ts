/**
 * Ensures a dedicated ADMIN user exists for live E2E tests.
 * Does not change passwords of other admin accounts.
 *
 * Run: npx ts-node -r tsconfig-paths/register scripts/ensure-e2e-admin.ts
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const USERNAME = process.env.ADMIN_E2E_LOGIN ?? 'e2e_admin';
const PASSWORD = process.env.ADMIN_E2E_PASSWORD ?? 'E2eAdmin!234';
const EMAIL = process.env.ADMIN_E2E_EMAIL ?? 'e2e-admin@sarh.test';

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const existing = await prisma.user.findFirst({
    where: { OR: [{ username: USERNAME }, { email: EMAIL }] },
  });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        username: USERNAME,
        email: EMAIL,
        passwordHash: hash,
        role: 'ADMIN',
        isActive: true,
        arabicName: existing.arabicName || 'مسؤول الاختبار',
        displayName: existing.displayName || 'E2E Admin',
      },
    });
    console.log(`Updated E2E admin: ${USERNAME}`);
  } else {
    await prisma.user.create({
      data: {
        username: USERNAME,
        email: EMAIL,
        passwordHash: hash,
        displayName: 'E2E Admin',
        arabicName: 'مسؤول الاختبار',
        role: 'ADMIN',
        isActive: true,
        phone: '+966509998877',
      },
    });
    console.log(`Created E2E admin: ${USERNAME}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
