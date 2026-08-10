import { createArtifactHistoryTables, registerHistoryListener } from './store';
import { artifactHistoryRoutes } from './routes';
import type { Plugin } from '../types';

// Premium artifact history: keeps the last N saved versions of each workflow,
// script, and trigger (retention configurable). Registered only when
// EDITION=premium (see backend/src/plugins/index.ts) — inert in the free build,
// where nothing registers on the onArtifactWrite seam.
export const plugin: Plugin = {
  name:    'artifact-history',
  migrate: createArtifactHistoryTables,
  init:    registerHistoryListener,
  routes:  artifactHistoryRoutes,
};
