import type { FastifyPluginAsync } from 'fastify';
import type Database from 'better-sqlite3';
import type { TriggerAdapter } from '../triggers/adapter';

export type PluginManifest = {
  service?: {
    displayName: string;
    envVar: string;
    defaultUrl: string;
    healthPath?: string;
  };
};

export type Plugin = {
  name: string;
  manifest?: PluginManifest;
  migrate?: (db: Database.Database) => void;
  // Runs once at startup, after migrate and before routes serve. Use it to wire
  // up in-process hooks/schedulers (e.g. register a db write listener, start a
  // periodic task).
  init?: () => void;
  routes?: FastifyPluginAsync;
  // Optional map of trigger kind → adapter. Each entry is registered at startup,
  // making the kind available in the trigger UI and API (e.g. 'kafka', 'rabbitmq').
  triggerAdapters?: Record<string, TriggerAdapter>;
};
