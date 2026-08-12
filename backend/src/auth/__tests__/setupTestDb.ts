import os from 'node:os';
import path from 'node:path';

// Import this FIRST in an auth test file, before anything that pulls in db.ts:
// db.ts reads DB_PATH at import time, so pointing it at a throwaway file has to
// happen as an import side effect (import order is evaluation order). Keeping the
// path here lets the test clean the file (+ WAL/SHM) up afterwards.
export const TEST_DB_PATH = path.join(
  os.tmpdir(),
  `flowline-auth-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
);

process.env.DB_PATH = TEST_DB_PATH;
