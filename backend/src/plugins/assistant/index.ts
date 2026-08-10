import { assistantRoutes } from './routes';
import { createChatTables } from './chats';
import type { Plugin } from '../types';

// Premium LLM assistant. Registered only when EDITION=premium (see
// backend/src/plugins/index.ts) — inert in the free build. Its tables are created
// here via migrate, so they exist only in premium builds.
export const plugin: Plugin = {
  name:    'assistant',
  migrate: createChatTables,
  routes:  assistantRoutes,
};
