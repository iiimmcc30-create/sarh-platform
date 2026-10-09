import { readFileSync } from 'fs';
import { join } from 'path';

describe('support_sarhan_tickets migration review', () => {
  const sql = readFileSync(
    join(
      __dirname,
      '../../prisma/migrations/20260901120000_support_sarhan_tickets/migration.sql',
    ),
    'utf8',
  );

  it('is additive and keeps legacy tickets on HUMAN_ACTIVE', () => {
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS "handlerMode".*DEFAULT 'HUMAN_ACTIVE'/s,
    );
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS "orderId" TEXT/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS "metadata" JSONB/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS "closedAt"/);
    expect(sql).toMatch(/ALTER COLUMN "authorId" DROP NOT NULL/);
    expect(sql).toMatch(/DEFAULT 'CUSTOMER'/);
    expect(sql).not.toMatch(/\bDROP TABLE\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toMatch(/DELETE FROM "SupportTicket"/i);
    expect(sql).not.toMatch(
      /UPDATE "SupportTicket"\s+SET\s+"handlerMode"\s*=\s*'AI_ACTIVE'/i,
    );
  });

  it('adds required enum values and indexes without reset', () => {
    expect(sql).toContain("ADD VALUE IF NOT EXISTS 'AI_ASSISTING'");
    expect(sql).toContain("ADD VALUE IF NOT EXISTS 'WAITING_FOR_CUSTOMER'");
    expect(sql).toContain("ADD VALUE IF NOT EXISTS 'WAITING_FOR_SUPPORT'");
    expect(sql).toContain('SupportTicket_orderId_idx');
    expect(sql).toContain('SupportTicket_handlerMode_idx');
    expect(sql).toContain('ON DELETE SET NULL');
  });
});

describe('help_center_faq_kb migration review', () => {
  const sql = readFileSync(
    join(
      __dirname,
      '../../prisma/migrations/20261009120000_help_center_faq_kb/migration.sql',
    ),
    'utf8',
  );

  it('is additive only', () => {
    for (const v of ['SUBSCRIPTIONS', 'COUNCILS', 'SAFETY', 'PROMOTION', 'COMMUNITY']) {
      expect(sql).toContain(`ADD VALUE IF NOT EXISTS '${v}'`);
    }
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS "key" TEXT;/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS "keywords" TEXT\[\] NOT NULL DEFAULT/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS "actionRoute" TEXT;/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS "actionLabel" TEXT;/);
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "Faq_key_key"');
    const code = sql.replace(/--.*$/gm, '');
    expect(code).not.toMatch(/\bDROP\b|\bTRUNCATE\b|\bDELETE\b|\bUPDATE\b/i);
  });
});
