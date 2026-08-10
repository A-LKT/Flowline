import { z } from 'zod';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { registerNode } from '../engine/nodeRegistry';
import { buildOutputsMap, runUserCode, resolveString } from '../engine/expression';
import type { ExecutionContext, NodeExecutionResult, WorkflowNode, InputBinding } from '../types';

const inputBindingSchema = z.object({
  kind:    z.enum(['node', 'primitive', 'variable']),
  nodeId:  z.string().optional(),
  value:   z.union([z.string(), z.number(), z.boolean()]).optional(),
  varName: z.string().optional(),
});

const schema = z.object({
  scriptName: z.string().min(1),
  inputs:     z.record(inputBindingSchema).optional(),
});

const resolveBindings = (
  bindings: Record<string, InputBinding> | undefined,
  context: ExecutionContext,
  outputs: Record<string, unknown>,
): Record<string, unknown> => {
  if (!bindings) return {};
  const result: Record<string, unknown> = {};
  for (const [name, binding] of Object.entries(bindings)) {
    if (binding.kind === 'node')           result[name] = outputs[binding.nodeId ?? ''];
    else if (binding.kind === 'primitive') result[name] = typeof binding.value === 'string' ? resolveString(binding.value, context) : binding.value;
    else if (binding.kind === 'variable')  result[name] = context.variables[binding.varName ?? ''];
  }
  return result;
};

// ─── Sandbox (Docker) execution ──────────────────────────────────────────────

const FILES_BASE_URL  = (process.env.FILES_INTERNAL_BASE_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const DATA_DIR        = path.resolve(process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : './data');
const FILES_DIR       = path.join(DATA_DIR, 'files');
const SANDBOX_BASE    = path.join(DATA_DIR, 'sandbox');
const DEFAULT_IMAGE   = 'node:22-slim';

// ── Runner ────────────────────────────────────────────────────────────────────
// Reads I/O from /run (ephemeral per-run mount).
// node_modules live in /sandbox (persistent per-script mount), reachable via NODE_PATH.
const makeRunner = (userCode: string) => `'use strict';
const fs = require('fs');
const path = require('path');

const input     = JSON.parse(fs.readFileSync('/run/input.json', 'utf8'));
const outputDir = '/run/output';
fs.mkdirSync(outputDir, { recursive: true });

async function main() {
${userCode}
}

main()
  .then(result => {
    fs.writeFileSync('/run/output.json', JSON.stringify(result ?? null));
  })
  .catch(err => {
    console.error('[runner error]', err.message);
    console.error(err.stack);
    fs.writeFileSync('/run/error.json', JSON.stringify({ message: err.message }));
    process.exit(1);
  });
`;

// ── Docker runner ─────────────────────────────────────────────────────────────

const DOCKER_PULL_RE = /^(Unable to find image|[a-f0-9]+: (Pulling|Waiting|Verifying|Download complete|Pull complete|Already exists)|Digest:|Status:|library\/)/;

const runInDocker = (
  sandboxDir: string,
  runDir: string,
  image: string,
  npmInstall: string,   // empty = already installed, skip
  timeoutSeconds: number,
  log: (msg: string) => void,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const installStep = npmInstall.trim()
      ? `npm install --prefix /sandbox ${npmInstall.trim()} 2>&1 && `
      : '';
    const cmd = `${installStep}node /run/runner.js 2>&1`;

    const proc = spawn('docker', [
      'run', '--rm',
      '--memory=512m', '--cpus=1',
      '-e', 'NODE_PATH=/sandbox/node_modules',
      '-v', `${sandboxDir}:/sandbox`,
      '-v', `${runDir}:/run`,
      image,
      'sh', '-c', cmd,
    ]);

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`Sandbox execution timed out after ${timeoutSeconds}s`));
    }, timeoutSeconds * 1000);

    const outputLines: string[] = [];
    let buf = '';
    proc.stdout.on('data', (d: Buffer) => {
      buf += d.toString();
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        outputLines.push(line);
        log(`[sandbox] ${line}`);
      }
    });

    const stderrLines: string[] = [];
    proc.stderr.on('data', (d: Buffer) => {
      d.toString().split('\n').forEach((l) => { if (l.trim()) stderrLines.push(l); });
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (buf.trim()) { outputLines.push(buf); log(`[sandbox] ${buf}`); }
      if (code === 0) {
        resolve();
      } else {
        const relevant = stderrLines.filter((l) => !DOCKER_PULL_RE.test(l.trim()));
        const detail = [...outputLines.slice(-30), ...relevant].join('\n').trim();
        reject(new Error(`Container exited with code ${code}${detail ? `:\n${detail}` : ''}`));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to start docker: ${err.message}. Is Docker running?`));
    });
  });

// ── File capture ──────────────────────────────────────────────────────────────

const guessMime = (name: string): string => {
  const ext = path.extname(name).toLowerCase();
  const map: Record<string, string> = {
    '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.wav': 'audio/wav',
    '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.webm': 'video/webm',
    '.txt': 'text/plain', '.json': 'application/json',
  };
  return map[ext] ?? 'application/octet-stream';
};

const captureFiles = (
  runDir: string,
  runId: string,
  nodeId: string,
): { name: string; url: string; mimeType: string }[] => {
  const outputDir = path.join(runDir, 'output');
  if (!fs.existsSync(outputDir)) return [];

  const destDir = path.join(FILES_DIR, runId, nodeId);
  fs.mkdirSync(destDir, { recursive: true });

  return fs.readdirSync(outputDir).map((name) => {
    fs.copyFileSync(path.join(outputDir, name), path.join(destDir, name));
    return {
      name,
      url:      `${FILES_BASE_URL}/files/${runId}/${nodeId}/${encodeURIComponent(name)}`,
      mimeType: guessMime(name),
    };
  });
};

// ── Sandbox executor ──────────────────────────────────────────────────────────

const npmHash = (deps: string) =>
  crypto.createHash('sha1').update(deps.trim()).digest('hex');

const executeSandbox = async (
  node: WorkflowNode,
  context: ExecutionContext,
  script: { id: string; code: string; timeout: number; dockerImage?: string; npmInstall?: string },
  input: Record<string, unknown>,
): Promise<NodeExecutionResult> => {
  const startedAt = Date.now();

  // Persistent dir: survives across runs, holds node_modules and cached binaries.
  const sandboxDir = path.join(SANDBOX_BASE, script.id);
  fs.mkdirSync(sandboxDir, { recursive: true });
  // Touch a marker so the TTL cleanup knows when this sandbox was last used.
  fs.writeFileSync(path.join(sandboxDir, '.last-used'), String(Date.now()));

  // Per-run dir: created fresh, deleted after run.
  const runDir = path.join(os.tmpdir(), `wf-${context.runId}-${node.id}`);
  fs.mkdirSync(runDir, { recursive: true });

  try {
    // Check if npm install can be skipped.
    const deps       = script.npmInstall ?? '';
    const hashFile   = path.join(sandboxDir, '.npm-hash');
    const current    = npmHash(deps);
    const cached     = fs.existsSync(hashFile) ? fs.readFileSync(hashFile, 'utf8').trim() : '';
    const needsInstall = deps.trim() !== '' && current !== cached;

    if (!needsInstall && deps.trim() !== '') {
      context.log('[sandbox] npm cache hit — skipping install');
    }

    fs.writeFileSync(path.join(runDir, 'input.json'), JSON.stringify(input));
    fs.writeFileSync(path.join(runDir, 'runner.js'), makeRunner(script.code));

    await runInDocker(
      sandboxDir,
      runDir,
      script.dockerImage || DEFAULT_IMAGE,
      needsInstall ? deps : '',
      script.timeout ?? 300,
      context.log,
    );

    // Persist the hash only after a successful install.
    if (needsInstall) fs.writeFileSync(hashFile, current);

    const errorFile = path.join(runDir, 'error.json');
    if (fs.existsSync(errorFile)) {
      const { message } = JSON.parse(fs.readFileSync(errorFile, 'utf8')) as { message: string };
      throw new Error(message);
    }

    const outputFile  = path.join(runDir, 'output.json');
    const scriptResult = fs.existsSync(outputFile)
      ? (JSON.parse(fs.readFileSync(outputFile, 'utf8')) as unknown)
      : null;

    const files = captureFiles(runDir, context.runId, node.id);

    const output = files.length > 0
      ? { ...(scriptResult && typeof scriptResult === 'object' ? scriptResult : { result: scriptResult }), files }
      : scriptResult;

    return { nodeId: node.id, status: 'success', output, startedAt, finishedAt: Date.now() };
  } catch (err) {
    return { nodeId: node.id, status: 'error', output: null, error: err instanceof Error ? err.message : String(err), startedAt, finishedAt: Date.now() };
  } finally {
    // Only delete the per-run dir. sandboxDir persists.
    fs.rmSync(runDir, { recursive: true, force: true });
  }
};

// ─── Main execute ─────────────────────────────────────────────────────────────

const execute = async (node: WorkflowNode, context: ExecutionContext): Promise<NodeExecutionResult> => {
  const startedAt = Date.now();
  const config = schema.parse(node.config);
  try {
    const script = context.scripts.find((s) => s.name === config.scriptName);
    if (!script) throw new Error(`Script "${config.scriptName}" not found`);

    const outputs = buildOutputsMap(context);
    const input   = script.inputs && script.inputs.length > 0
      ? resolveBindings(config.inputs as Record<string, InputBinding> | undefined, context, outputs)
      : context.variables;

    if (script.sandbox) {
      return await executeSandbox(node, context, script, input as Record<string, unknown>);
    }

    const scriptCtx = { ...context, outputs };
    const out = runUserCode(script.code, ['input', 'context'], [input, scriptCtx], (script.timeout ?? 300) * 1000);
    const resolved = (out instanceof Promise) ? await out : out;
    return { nodeId: node.id, status: 'success', output: resolved, startedAt, finishedAt: Date.now() };
  } catch (err) {
    return { nodeId: node.id, status: 'error', output: null, error: err instanceof Error ? err.message : String(err), startedAt, finishedAt: Date.now() };
  }
};

registerNode({
  type: 'script',
  label: 'Script',
  description: "Runs a named Script (from the Scripts space). Returns the script return value. Sandboxed scripts run in Docker and can emit files.",
  category: 'Logic',
  configSchema: schema,
  outputSchema: z.unknown(),
  execute,
});
