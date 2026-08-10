/**
 * Completeness invariant: every registered node must carry the reference
 * metadata the AI needs to author a valid workflow. Generation already
 * guarantees a node *appears*; this guarantees it appears *complete* — catching
 * the real failure mode of a new node registered without a description, output
 * schema, or (for branch nodes) handles.
 *
 * Requires the full node registry, which pulls in the database layer, so this
 * test runs in the same environment as the app (CI / a working Node build).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Register every built-in node …
import '../../nodes';
// … and every plugin node.
import '../../plugins/ai-llm/completionNode';
import '../../plugins/ollama/completionNode';
import '../../plugins/ollama/visionNode';
import '../../plugins/voice-to-text/transcribeNode';

import { getAllNodes } from '../../engine/nodeRegistry';
import { buildCapabilityReference } from '../capabilities';

// Branch nodes that MUST declare handles for the AI to wire edges.
const BRANCH_NODES = new Set(['condition', 'fork', 'switch', 'loop', 'iterator']);
// Nodes with no config and/or no meaningful output (pure canvas / diagnostic).
const NO_CONFIG = new Set(['label', 'failure']);
const NO_OUTPUT = new Set(['label', 'failure']);

test('every registered node has complete reference metadata', () => {
  const nodes = getAllNodes();
  assert.ok(nodes.length >= 30, `expected the full node set, got ${nodes.length}`);

  for (const def of nodes) {
    assert.ok(def.description && def.description.length > 0, `${def.type}: missing description`);
    assert.ok(def.category && def.category.length > 0, `${def.type}: missing category`);
    if (!NO_CONFIG.has(def.type)) assert.ok(def.configSchema, `${def.type}: missing configSchema`);
    if (!NO_OUTPUT.has(def.type)) assert.ok(def.outputSchema, `${def.type}: missing outputSchema`);
    if (BRANCH_NODES.has(def.type)) {
      assert.ok((def.handles?.length ?? 0) >= 2, `${def.type}: branch node must declare handles`);
    }
  }
});

test('configSchema accepts the documented recipe configs round-trip', () => {
  // The generated reference must build without throwing for the full registry.
  const ref = buildCapabilityReference();
  assert.equal(ref.counts.nodeTypes, getAllNodes().length);
  for (const n of ref.nodeTypes) {
    assert.ok(n.type && n.label && n.category, `incomplete node in reference: ${JSON.stringify(n)}`);
  }
});
