import { createHousekeepingTables } from './config';
import { startHousekeepingScheduler } from './runner';
import { housekeepingRoutes } from './routes';
import type { Plugin } from '../types';

// Premium housekeeping: a scheduled runner that purges old job runs (and prunes
// orphaned deprecated workflows) to keep the system fast. Registered only when
// EDITION=premium (see backend/src/plugins/index.ts) — inert in the free build.
export const plugin: Plugin = {
  name:    'housekeeping',
  migrate: createHousekeepingTables,
  init:    startHousekeepingScheduler,
  routes:  housekeepingRoutes,
};
