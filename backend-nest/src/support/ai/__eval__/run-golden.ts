import { AiBudgetService } from '../../../ai-safety/ai-budget.service';
import { AiCallGuardService } from '../../../ai-safety/ai-call-guard.service';
import { LoggerService } from '../../../common/services/logger.service';
import { createAiProvider } from '../create-ai-provider';
import {
  actualLabel,
  contextForQuestion,
  evaluateHeuristic,
  expectedLabel,
  loadGolden,
  type GoldenRow,
} from './evaluate-golden';

function printRows(rows: GoldenRow[]) {
  const missed = rows.filter((row) => !row.ok);
  for (const row of missed) {
    process.stdout.write(
      `${row.id}\texpected ${row.expected}\tgot ${row.actual}\n`,
    );
  }
  process.stdout.write(
    `${rows.length - missed.length}/${rows.length} matched\n`,
  );
  return missed.length;
}

async function runLive(rowsOut: GoldenRow[]) {
  const key = (process.env.OPENAI_API_KEY || process.env.AI_API_KEY || '').trim();
  if (!key) {
    process.stderr.write('Set OPENAI_API_KEY to run the live model.\n');
    process.exitCode = 2;
    return;
  }
  if (!process.env.REDIS_ENABLED) process.env.REDIS_ENABLED = 'false';
  const logger = new LoggerService();
  const provider = createAiProvider(
    logger,
    new AiCallGuardService(new AiBudgetService(logger), logger),
  );
  const golden = loadGolden();
  for (const item of golden.cases) {
    const decision = await provider.completeSupportTurn(
      contextForQuestion(item.question),
    );
    const expected = expectedLabel(item.expect);
    const actual = actualLabel(decision);
    rowsOut.push({
      id: item.id,
      ok: actual === expected,
      expected,
      actual,
      score: null,
    });
  }
}

async function main() {
  const golden = loadGolden();
  if (process.argv.includes('--live')) {
    const rows: GoldenRow[] = [];
    await runLive(rows);
    if (!rows.length) return;
    const missed = printRows(rows);
    if (missed) process.exitCode = 1;
    return;
  }
  const rows = await evaluateHeuristic(golden.cases);
  const missed = printRows(rows);
  if (missed) process.exitCode = 1;
}

void main();
