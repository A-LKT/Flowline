/**
 * Tests for the get_run tool's run summary. The troubleshooting quality of the
 * assistant hinges on this: a failed node must surface its resolvedConfig (the
 * URL/service/values that produced the failure), while successful nodes stay
 * terse and no field is allowed to balloon the context. Uses a throwaway temp DB.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import type { NodeExecutionResult } from '../../../types';

// Point the db module at a temp file BEFORE it is (dynamically) imported.
const DB_PATH = path.join(os.tmpdir(), `assistant-getrun-${process.pid}-${Date.now()}.db`);
process.env.DB_PATH = DB_PATH;

type Mod = typeof import('../tools');
let runTool: Mod['runTool'];

const RUN_ID = 'run-real-0001';
const WF_ID = 'wf-real-0001';

const scope = (over: Record<string, unknown>) =>
  ({ workflows: 'none', scripts: 'none', triggers: 'none', runs: 'none', tables: [], ...over }) as never;

before(async () => {
  const db = await import('../../../db');
  const now = Date.now();
  db.upsertWorkflow({ id: WF_ID, name: 'V2T Pipeline', version: 1, nodes: [], edges: [], variables: {}, createdAt: now, updatedAt: now } as never);
  db.createRun({ id: RUN_ID, workflowId: WF_ID, status: 'error', triggerType: 'manual', createdAt: now, workflowVersion: 1 });
  const okNode: NodeExecutionResult = {
    nodeId: 'n-ok', status: 'success',
    resolvedConfig: { tableId: 't1', filter: '' }, output: { rows: [1, 2, 3] },
    startedAt: now, finishedAt: now,
  };
  const failNode: NodeExecutionResult = {
    nodeId: 'n-fail', status: 'error',
    error: 'fetch failed: ECONNREFUSED',
    resolvedConfig: { audioUrl: 'http://host.docker.internal:3001/x.mp3', endpoint: '/transcribe' },
    output: null,
    startedAt: now, finishedAt: now,
  };
  const bigNode: NodeExecutionResult = {
    nodeId: 'n-big', status: 'error', error: 'boom',
    resolvedConfig: { blob: 'x'.repeat(10_000) }, output: null,
    startedAt: now, finishedAt: now,
  };
  db.updateRun(RUN_ID, { status: 'error', results: { 'n-ok': okNode, 'n-fail': failNode, 'n-big': bigNode }, logs: [{ ts: now, text: '[INFO] started' }] });
  ({ runTool } = await import('../tools'));
});

after(() => {
  for (const p of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`]) { try { fs.unlinkSync(p); } catch { /* ignore */ } }
});

type Node = { nodeId: string; status: string; error?: string; resolvedConfig?: unknown; output?: unknown };
type Summary = { id: string; status: string; nodes: Node[] };

const getSummary = () => runTool('get_run', { runId: RUN_ID }, scope({ runs: { ids: [RUN_ID] } })) as Summary;

test('a failed node surfaces its resolvedConfig and error', () => {
  const node = getSummary().nodes.find((n) => n.nodeId === 'n-fail')!;
  assert.equal(node.error, 'fetch failed: ECONNREFUSED');
  assert.deepEqual(node.resolvedConfig, { audioUrl: 'http://host.docker.internal:3001/x.mp3', endpoint: '/transcribe' });
});

test('a successful node stays terse — no config/output leaked', () => {
  const node = getSummary().nodes.find((n) => n.nodeId === 'n-ok')!;
  assert.equal(node.status, 'success');
  assert.ok(!('resolvedConfig' in node), 'successful node must not carry resolvedConfig');
  assert.ok(!('output' in node), 'successful node must not carry output');
});

test('an oversized field on a failed node is truncated', () => {
  const node = getSummary().nodes.find((n) => n.nodeId === 'n-big')!;
  const cfg = JSON.stringify(node.resolvedConfig);
  assert.ok(cfg.includes('truncated'), 'oversized resolvedConfig must be truncated');
  assert.ok(cfg.length < 6000, 'truncated field must be far smaller than the 10k original');
});

test('get_run still enforces run scope', () => {
  const denied = runTool('get_run', { runId: RUN_ID }, scope({ runs: 'none' })) as { error?: string };
  assert.match(denied.error ?? '', /Not permitted/);
});
