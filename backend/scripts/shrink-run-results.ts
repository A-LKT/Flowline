/**
 * One-time maintenance: shrink already-persisted run results by stripping the
 * oversized base64 blobs (generated images, transcription audio, vision inputs)
 * that bloat the runs table — the same sanitisation new runs now get on write
 * (see src/runner/sanitizeResults.ts). Then VACUUM to reclaim the freed space
 * on disk (an UPDATE alone leaves the file the same size).
 *
 * Idempotent: already-stripped rows are left untouched. Safe to re-run.
 *
 * Stop the backend first — VACUUM needs an exclusive lock and will throw
 * SQLITE_BUSY if the server holds the database open.
 *
 * Run:  npx tsx scripts/shrink-run-results.ts
 */
import Database from 'better-sqlite3';
import path from 'path';
import { sanitizeResults } from '../src/runner/sanitizeResults';

const DB_PATH = path.resolve(process.env.DB_PATH ?? './data/workflow.db');
const MB = (bytes: number) => (bytes / 1048576).toFixed(1);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const rows = db.prepare(`SELECT id, results FROM runs WHERE results IS NOT NULL`).all() as {
  id: string;
  results: string;
}[];

const update = db.prepare(`UPDATE runs SET results = @results WHERE id = @id`);

let scanned = 0;
let rewritten = 0;
let before = 0;
let after = 0;

const applyAll = db.transaction(() => {
  for (const row of rows) {
    scanned++;
    before += row.results.length;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(row.results);
    } catch {
      after += row.results.length;
      continue; // leave unparseable rows alone
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sanitized = JSON.stringify(sanitizeResults(parsed as any));
    after += sanitized.length;
    if (sanitized.length !== row.results.length) {
      update.run({ id: row.id, results: sanitized });
      rewritten++;
    }
  }
});

console.log(`DB: ${DB_PATH}`);
console.log(`Scanning ${rows.length} runs with stored results…`);
applyAll();

console.log(`\nScanned:   ${scanned}`);
console.log(`Rewritten: ${rewritten}`);
console.log(`results total: ${MB(before)}MB → ${MB(after)}MB`);

console.log('\nCheckpointing WAL and running VACUUM to reclaim disk…');
db.pragma('wal_checkpoint(TRUNCATE)');
db.exec('VACUUM');
db.close();
console.log('Done. Restart the backend.');
