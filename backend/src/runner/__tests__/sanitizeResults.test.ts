/**
 * Unit tests for run-result sanitisation. Pure functions, no DB — run anywhere.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  stripLargeValues,
  sanitizeResults,
  isStripped,
  MAX_VALUE_BYTES,
  type StrippedValue,
} from '../sanitizeResults';
import type { NodeExecutionResult } from '../../types';

const big = 'x'.repeat(MAX_VALUE_BYTES + 1);
const small = 'x'.repeat(MAX_VALUE_BYTES); // exactly at the cap — kept

test('small strings and non-strings pass through untouched', () => {
  assert.equal(stripLargeValues(small), small);
  assert.equal(stripLargeValues(42), 42);
  assert.equal(stripLargeValues(true), true);
  assert.equal(stripLargeValues(null), null);
});

test('oversized strings become a structured sentinel', () => {
  const out = stripLargeValues(big) as StrippedValue;
  assert.ok(isStripped(out));
  assert.equal(out.bytes, big.length);
  assert.equal(out.preview.length, 48);
});

test('strips blobs nested in objects and arrays', () => {
  const out = stripLargeValues({ a: [{ b64: big }], keep: small }) as {
    a: { b64: unknown }[];
    keep: string;
  };
  assert.ok(isStripped(out.a[0].b64));
  assert.equal(out.keep, small);
});

test('sanitizeResults strips output, input, resolvedConfig, and iterations', () => {
  const results: Record<string, NodeExecutionResult> = {
    n1: {
      nodeId: 'n1',
      status: 'success',
      output: { image: big },
      input: { upstream: big },
      resolvedConfig: { prompt: big },
      startedAt: 1,
      finishedAt: 2,
      iterations: [
        { nodeId: 'n1', status: 'success', output: { image: big }, startedAt: 1, finishedAt: 2 },
      ],
    },
  };
  const out = sanitizeResults(results);
  assert.ok(isStripped((out.n1.output as { image: unknown }).image));
  assert.ok(isStripped((out.n1.input as { upstream: unknown }).upstream));
  assert.ok(isStripped((out.n1.resolvedConfig as { prompt: unknown }).prompt));
  assert.ok(isStripped((out.n1.iterations![0].output as { image: unknown }).image));
  // Structural fields survive.
  assert.equal(out.n1.status, 'success');
  assert.equal(out.n1.startedAt, 1);
});

test('is idempotent — re-sanitising an already-stripped tree is a no-op', () => {
  const once = stripLargeValues({ b64: big });
  const twice = stripLargeValues(once);
  assert.deepEqual(twice, once);
});
