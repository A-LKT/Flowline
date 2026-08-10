/**
 * Guards the OpenAI-schema → Anthropic-tool conversion in agent.ts
 * (runAnthropicAgent's ANTHROPIC_TOOLS). The Anthropic Messages API requires
 * every tool to have a name, a description, and an input_schema whose top-level
 * type is "object" — assert the source schemas satisfy that, so a schema edit
 * that would 400 the whole Anthropic loop fails here instead of at runtime.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOOL_SCHEMAS, PROPOSE_SCHEMA } from '../tools';

const ALL = [...TOOL_SCHEMAS, PROPOSE_SCHEMA];

test('propose_artifact is included alongside the read tools', () => {
  const names = ALL.map((t) => t.function.name);
  assert.ok(names.includes('propose_artifact'));
  // The Anthropic tool list is exactly the read tools plus propose_artifact.
  assert.equal(ALL.length, TOOL_SCHEMAS.length + 1);
});

test('every tool converts to a valid Anthropic tool definition', () => {
  for (const t of ALL) {
    const fn = t.function;
    assert.equal(typeof fn.name, 'string');
    assert.ok(fn.name.length > 0, `empty name`);
    assert.equal(typeof fn.description, 'string');
    assert.ok(fn.description.length > 0, `${fn.name}: empty description`);
    const schema = fn.parameters as { type?: string; properties?: unknown };
    assert.equal(schema.type, 'object', `${fn.name}: input_schema.type must be "object"`);
    assert.equal(typeof schema.properties, 'object', `${fn.name}: missing properties`);
  }
});

test('tool names are unique (Anthropic rejects duplicates)', () => {
  const names = ALL.map((t) => t.function.name);
  assert.equal(new Set(names).size, names.length);
});
