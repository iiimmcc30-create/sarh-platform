import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { LoggerService } from '../../common/services/logger.service';
import { SupportRepository } from '../repositories/support.repository';
import {
  FAQ_KB_VERSION,
  FAQ_KNOWLEDGE_BASE,
  LEGACY_SEED_QUESTIONS,
  OBSOLETE_FAQ_PATTERN,
} from '../kb/faq-knowledge-base';

export const FAQ_KB_VERSION_SETTING_KEY = 'support.faqKbVersion';

/** Legacy rows to retire: old 17-row seed questions or delivery-app wording. */
export function legacyFaqIdsToRetire(
  rows: { id: string; questionAr: string; answerAr: string }[],
): string[] {
  const legacy = new Set(LEGACY_SEED_QUESTIONS.map((q) => q.trim()));
  return rows
    .filter(
      (r) =>
        legacy.has(r.questionAr.trim()) ||
        OBSOLETE_FAQ_PATTERN.test(r.questionAr) ||
        OBSOLETE_FAQ_PATTERN.test(r.answerAr),
    )
    .map((r) => r.id);
}

/**
 * Seeds the help-center knowledge base once per FAQ_KB_VERSION:
 * upserts every entry by its stable key and soft-retires (isActive=false) the
 * legacy seed rows. Between versions nothing is touched, so admin edits stay.
 * Never hard-deletes. Silently skips when the DB is not migrated yet.
 */
@Injectable()
export class SupportSeedService implements OnModuleInit {
  constructor(
    private readonly repo: SupportRepository,
    @Optional() private readonly logger?: LoggerService,
  ) {}

  async onModuleInit() {
    try {
      await this.seedKnowledgeBase();
    } catch {
      // DB may not be migrated yet during boot (Faq.key missing) — retry next boot.
    }
  }

  async seedKnowledgeBase(): Promise<{
    upserted: number;
    retired: number;
  } | null> {
    const current = await this.repo.getAppSetting(FAQ_KB_VERSION_SETTING_KEY);
    const seeded = Number(current?.value ?? 0);
    if (Number.isFinite(seeded) && seeded >= FAQ_KB_VERSION) return null;

    for (const entry of FAQ_KNOWLEDGE_BASE) {
      await this.repo.upsertFaqByKey(entry);
    }
    const legacyRows = await this.repo.listActiveUnkeyedFaqs();
    const retire = legacyFaqIdsToRetire(legacyRows);
    await this.repo.deactivateFaqs(retire);
    await this.repo.upsertAppSetting(
      FAQ_KB_VERSION_SETTING_KEY,
      FAQ_KB_VERSION,
      'إصدار قاعدة معرفة مركز المساعدة',
    );
    this.logger?.info(
      {
        event: 'FAQ_KB_SEEDED',
        version: FAQ_KB_VERSION,
        upserted: FAQ_KNOWLEDGE_BASE.length,
        retired: retire.length,
      },
      'Help-center knowledge base seeded',
    );
    return { upserted: FAQ_KNOWLEDGE_BASE.length, retired: retire.length };
  }
}
