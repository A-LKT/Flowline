import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs';
import * as db from '../db';
import { fireWorkflowRun } from '../runner/fire';
import type { TriggerAdapter } from './adapter';
import type { Trigger, FileWatchConfig } from '../types';

const watchers = new Map<string, chokidar.FSWatcher>();

function matchesPattern(filename: string, pattern: string | undefined): boolean {
  if (!pattern) return true;
  // Simple glob: support * wildcard only
  const re = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
  return re.test(filename);
}

export const fileWatchAdapter: TriggerAdapter = {
  start(trigger: Trigger) {
    this.stop(trigger.id);

    const cfg = trigger.config as FileWatchConfig;
    const allowedEvents = cfg.events?.length ? cfg.events : ['add', 'change'];

    const watcher = chokidar.watch(cfg.watchPath, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: cfg.debounceMs ?? 500, pollInterval: 100 },
      depth: 99,
    });

    const handleEvent = (event: string, filePath: string) => {
      if (!allowedEvents.includes(event as 'add' | 'change' | 'unlink')) return;
      if (!matchesPattern(path.basename(filePath), cfg.pattern)) return;

      const t = db.getTrigger(trigger.id);
      if (!t || !t.enabled) return;

      let size: number | undefined;
      let mtimeMs: number | undefined;
      if (event !== 'unlink') {
        try {
          const stat = fs.statSync(filePath);
          size = stat.size;
          mtimeMs = stat.mtimeMs;
        } catch { /* file may have vanished */ }
      }

      const payload = { event, path: filePath, filename: path.basename(filePath), size, mtimeMs };

      if (t.target.type === 'workflow') {
        fireWorkflowRun(t.target.id, payload, 'file-watch', t.id);
      }
    };

    watcher.on('all', handleEvent);
    watcher.on('error', (err) => console.error(`[file-watch:${trigger.id}] watcher error:`, err));

    watchers.set(trigger.id, watcher);
  },

  stop(id: string) {
    const watcher = watchers.get(id);
    if (watcher) {
      watcher.close().catch(() => {});
      watchers.delete(id);
    }
  },
};
