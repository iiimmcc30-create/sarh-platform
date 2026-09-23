import { Prisma } from '@prisma/client';

export async function nextButcherOrderNumber(
  tx: Prisma.TransactionClient,
): Promise<string> {
  const year = new Date().getFullYear();
  await tx.orderNumberSequence.upsert({
    where: { year },
    create: { year, lastNumber: 0 },
    update: {},
  });
  const seq = await tx.orderNumberSequence.update({
    where: { year },
    data: { lastNumber: { increment: 1 } },
    select: { lastNumber: true },
  });
  return `ORD-${year}-${String(seq.lastNumber).padStart(6, '0')}`;
}
