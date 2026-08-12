/**
 * Guards validateProposal in tools.ts — the structural check propose_artifact runs
 * before a proposal becomes an Apply card. Focus on the trigger target rule: a
 * trigger must carry a sibling `target: { type:'workflow', id }` (the id may be the
 * workflow's NAME, resolved on Apply), so a targetless trigger is caught in the
 * agent loop instead of failing only when the user clicks Apply.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateProposal } from '../tools';

test('trigger with a workflow target validates', () => {
  const r = validateProposal('trigger', {
    name: 'Every 30m', kind: 'schedule', enabled: true,
    target: { type: 'workflow', id: 'Usage Check and Notification' },
    config: { cron: '*/30 * * * *' },
  });
  assert.equal(r.ok, true);
});

test('trigger missing target is rejected', () => {
  const r = validateProposal('trigger', { kind: 'schedule', config: { cron: '* * * * *' } });
  assert.equal(r.ok, false);
  assert.ok(r.errors?.some((e) => e.includes('trigger.target')), 'should flag the missing target');
});

test('trigger with a non-workflow target type is rejected', () => {
  const r = validateProposal('trigger', {
    kind: 'schedule', config: { cron: '* * * * *' }, target: { type: 'queue', id: 'x' },
  });
  assert.equal(r.ok, false);
});

test('trigger still requires kind and config', () => {
  const r = validateProposal('trigger', { target: { type: 'workflow', id: 'W' } });
  assert.equal(r.ok, false);
  assert.ok(r.errors?.some((e) => e.includes('trigger.kind')));
  assert.ok(r.errors?.some((e) => e.includes('trigger.config')));
});

test('workflow proposal is unaffected by the trigger target rule', () => {
  const r = validateProposal('workflow', { name: 'W', nodes: [], edges: [] });
  assert.equal(r.ok, true);
});
