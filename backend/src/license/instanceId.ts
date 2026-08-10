import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// A stable, per-install identifier. Premium licenses can be bound to this id so a
// single license file copied to a second install fails verification there (see
// license/verify.ts). Persisted as a plain file in the data dir — deliberately no
// DB coupling, so this stays a pure leaf module safe to call at boot before the
// database is wired. Mirrors the ./data convention in db.ts and nodes/_fileRoot.ts.
const DATA_DIR = path.resolve(process.env.DATA_DIR ?? './data');
const ID_PATH = path.join(DATA_DIR, 'instance-id');

let cached: string | null = null;

export function getInstanceId(): string {
  if (cached) return cached;
  try {
    const existing = fs.readFileSync(ID_PATH, 'utf8').trim();
    if (existing) return (cached = existing);
  } catch {
    /* not created yet — fall through and mint one */
  }
  const id = `inst_${randomUUID()}`;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(ID_PATH, id, { encoding: 'utf8', flag: 'wx' });
    return (cached = id);
  } catch {
    // Lost a create race, or the dir is read-only. Prefer a value already on disk;
    // otherwise use the in-memory id for this process so boot never fails on it.
    try {
      const raced = fs.readFileSync(ID_PATH, 'utf8').trim();
      if (raced) return (cached = raced);
    } catch { /* ignore */ }
    return (cached = id);
  }
}
