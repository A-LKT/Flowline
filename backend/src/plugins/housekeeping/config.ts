import type Database from 'better-sqlite3';
import { db } from '../../db';

// Housekeeping keeps the system fast by pruning old run history on a schedule.
// Config is a single row (id = 1). Premium-only: the table is created by the
// plugin's migrate hook, so it exists only in premium builds.

export type HousekeepingConfig = {
  enabled: boolean;
  /** Delete runs older than this many days. 0 = no age-based purge. */
  maxAgeDays: number;
  /** Keep at most this many runs per workflow (newest kept). 0 = unlimited. */
  keepPerWorkflow: number;
  /** Only runs in these statuses are eligible for purging. */
  statuses: string[];
  /** How often the scheduler runs the purge, in hours. */
  intervalHours: number;
  /** Run SQLite VACUUM after a purge to reclaim disk (heavier, off by default). */
  vacuum: boolean;
  /** Also drop deprecated workflows once all their runs are gone. */
  pruneDeprecated: boolean;
  lastRunAt: number | null;
  lastRemovedRuns: number | null;
};

export const DEFAULT_CONFIG: HousekeepingConfig = {
  enabled: false,
  maxAgeDays: 90,
  keepPerWorkflow: 0,
  statuses: ['success', 'error', 'cancelled'],
  intervalHours: 24,
  vacuum: false,
  pruneDeprecated: true,
  lastRunAt: null,
  lastRemovedRuns: null,
};

export function createHousekeepingTables(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS housekeeping_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      config TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
}

type Row = { config: string };

export function getConfig(): HousekeepingConfig {
  const row = db.prepare('SELECT config FROM housekeeping_config WHERE id = 1').get() as Row | undefined;
  if (!row) return { ...DEFAULT_CONFIG };
  try { return { ...DEFAULT_CONFIG, ...(JSON.parse(row.config) as Partial<HousekeepingConfig>) }; }
  catch { return { ...DEFAULT_CONFIG }; }
}

export function saveConfig(cfg: HousekeepingConfig): void {
  db.prepare(`
    INSERT INTO housekeeping_config (id, config, updated_at) VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET config = excluded.config, updated_at = excluded.updated_at
  `).run(JSON.stringify(cfg), Date.now());
}
