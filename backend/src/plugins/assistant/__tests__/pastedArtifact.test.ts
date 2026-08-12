/**
 * Guards looksLikePastedArtifact in agent.ts — the detector that turns a reply
 * which pasted an artifact as JSON (instead of calling propose_artifact) into a
 * one-time nudge. It must fire on the three documented artifact shapes and stay
 * quiet on ordinary explanatory snippets, so it neither drops real proposals nor
 * loops the model on innocuous replies.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksLikePastedArtifact } from '../agent';

test('fires on a pasted workflow (nodes/edges)', () => {
  const reply = 'Here is the workflow:\n```json\n{ "name": "x", "nodes": [], "edges": [] }\n```';
  assert.equal(looksLikePastedArtifact(reply), true);
});

test('fires on a pasted trigger (kind + config)', () => {
  const reply = '```json\n{ "name": "cron", "kind": "schedule", "config": { "cron": "*/30 * * * *" } }\n```';
  assert.equal(looksLikePastedArtifact(reply), true);
});

test('fires on a pasted script (code + name)', () => {
  const reply = '```json\n{ "name": "notify", "code": "return 1;" }\n```';
  assert.equal(looksLikePastedArtifact(reply), true);
});

test('fires regardless of the fence language tag', () => {
  const reply = '```\n{ "name": "x", "nodes": [] }\n```';
  assert.equal(looksLikePastedArtifact(reply), true);
});

test('stays quiet on prose with no fenced block', () => {
  const reply = 'I built a workflow with nodes and edges and a schedule trigger for you.';
  assert.equal(looksLikePastedArtifact(reply), false);
});

test('stays quiet on an illustrative snippet that is not an artifact', () => {
  const reply = 'The output looks like:\n```json\n{ "status": "ok", "count": 3 }\n```';
  assert.equal(looksLikePastedArtifact(reply), false);
});

test('stays quiet on a non-JSON code block', () => {
  const reply = '```bash\ncurl http://localhost/api/usage\n```';
  assert.equal(looksLikePastedArtifact(reply), false);
});
