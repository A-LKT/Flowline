/**
 * Enforcement tests that do NOT require the database — they run anywhere.
 * Cover: recipe validity, trigger-kind drift, render safety, and the two
 * security invariants (no db import, GET-only route surface).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { workflowSchema } from '../contracts';
import { RECIPES } from '../recipes';
import { TRIGGER_KINDS } from '../triggers';

const REF_DIR = path.resolve(__dirname, '..');
const ROUTE_FILE = path.resolve(__dirname, '../../routes/aiReference.ts');

// TriggerKind union from ../../types.ts — kept in sync via this test.
const EXPECTED_TRIGGER_KINDS = ['schedule', 'webhook', 'file-watch', 'email'];

test('every recipe is a valid workflow', () => {
  for (const r of RECIPES) {
    const res = workflowSchema.safeParse(r.workflow);
    assert.ok(res.success, `recipe "${r.name}" invalid: ${res.success ? '' : JSON.stringify(res.error.issues)}`);
  }
});

test('recipes use only placeholder hosts (no data leak in fixtures)', () => {
  const json = JSON.stringify(RECIPES);
  // crude but effective: real-looking secrets/tokens should never appear
  assert.ok(!/sk-[A-Za-z0-9]{20,}/.test(json), 'recipe contains a real-looking API key');
  for (const m of json.match(/https?:\/\/[^"\\]+/g) ?? []) {
    assert.ok(/example\.|hooks\.slack\.example/.test(m), `recipe references non-placeholder URL: ${m}`);
  }
});

test('trigger reference matches the TriggerKind union', () => {
  const kinds = TRIGGER_KINDS.map((t) => t.kind).sort();
  assert.deepEqual(kinds, [...EXPECTED_TRIGGER_KINDS].sort(),
    'TRIGGER_KINDS drifted from the TriggerKind union in types.ts — update reference/triggers.ts');
});

test('SECURITY: reference modules and the AI route never import the db', () => {
  const files = fs.readdirSync(REF_DIR).filter((f) => f.endsWith('.ts'));
  files.push('../routes/aiReference.ts');
  for (const f of files) {
    const full = f.startsWith('..') ? path.resolve(REF_DIR, f) : path.join(REF_DIR, f);
    const src = fs.readFileSync(full, 'utf8');
    assert.ok(!/['"][^'"]*\/db['"]/.test(src) && !/from ['"]\.\.\/db['"]/.test(src),
      `${f} imports db — the AI reference must never touch user data`);
  }
});

test('SECURITY: the AI route surface is GET-only', () => {
  const src = fs.readFileSync(ROUTE_FILE, 'utf8');
  for (const verb of ['app.post', 'app.put', 'app.delete', 'app.patch']) {
    assert.ok(!src.includes(verb), `aiReference route uses ${verb} — the AI must not be able to mutate the system`);
  }
});
