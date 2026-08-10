import type { NodeExecutionResult } from '../types';

// Persisted run results embed, for every node, its `output` PLUS a snapshot of
// the upstream `input`, PLUS `resolvedConfig`, PLUS a full copy per loop
// `iteration` (see engine/executor.ts). Large base64 blobs — generated images,
// downloaded audio for transcription, Ollama vision inputs — therefore land in
// the DB (and the 5-min SSE buffer, and admin backups) copied ~10× per run,
// ballooning a single run to tens of MB.
//
// Execution passes data between nodes through the in-memory results map, never
// the persisted copy, so replacing oversized strings with a sentinel at the
// persistence boundary costs nothing at runtime. Two deliberate consequences:
//   • run history shows the sentinel instead of the blob;
//   • re-running a node that consumed a stripped upstream value (runs.ts
//     rerun-node injects stored results into the context) sees the sentinel,
//     not the original bytes. Re-running the *producing* node re-fetches fine.

// Real node payloads in practice top out around 0.35MB; the blobs that cause the
// problem start at ~2.8MB — so this threshold separates them with wide margin.
export const MAX_VALUE_BYTES = 256 * 1024;

export type StrippedValue = { __stripped: true; bytes: number; preview: string };

export const isStripped = (v: unknown): v is StrippedValue =>
  v !== null && typeof v === 'object' && (v as { __stripped?: unknown }).__stripped === true;

// Recursively replace any string longer than MAX_VALUE_BYTES with a structured
// sentinel. Structured (not a lookalike string) so the UI and any downstream
// consumer can detect it unambiguously via isStripped(). Base64 is ASCII, so
// String.length is an accurate byte proxy.
export const stripLargeValues = (v: unknown): unknown => {
  if (typeof v === 'string') {
    return v.length > MAX_VALUE_BYTES
      ? ({ __stripped: true, bytes: v.length, preview: v.slice(0, 48) } satisfies StrippedValue)
      : v;
  }
  if (Array.isArray(v)) return v.map(stripLargeValues);
  if (v !== null && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, stripLargeValues(x)]),
    );
  }
  return v;
};

export const sanitizeResults = (
  results: Record<string, NodeExecutionResult>,
): Record<string, NodeExecutionResult> =>
  stripLargeValues(results) as Record<string, NodeExecutionResult>;
