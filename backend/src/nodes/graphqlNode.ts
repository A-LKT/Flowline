import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';
import { resolveString } from '../engine/expression';
import type { ExecutionContext, NodeExecutionResult, WorkflowNode } from '../types';

const schema = z.object({
  url:       z.string().min(1),
  query:     z.string().min(1),
  variables: z.string().default(''),
  headers:   z.string().default(''),
});

const execute = async (node: WorkflowNode, context: ExecutionContext): Promise<NodeExecutionResult> => {
  const startedAt = Date.now();
  const config = schema.parse(node.config);
  try {
    const url = resolveString(config.url, context);
    let gqlVariables: unknown = undefined;
    if (config.variables.trim()) {
      try { gqlVariables = JSON.parse(config.variables); } catch { throw new Error('variables must be valid JSON'); }
    }
    let extraHeaders: Record<string, string> = {};
    if (config.headers.trim()) {
      try { extraHeaders = JSON.parse(config.headers) as Record<string, string>; } catch { /* ignore */ }
    }
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...extraHeaders },
      body: JSON.stringify({ query: config.query, variables: gqlVariables }),
    });
    const json = await response.json() as { data?: unknown; errors?: unknown[] };
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { nodeId: node.id, status: 'success', output: { data: json.data, errors: json.errors, status: response.status }, startedAt, finishedAt: Date.now() };
  } catch (err) {
    return { nodeId: node.id, status: 'error', output: null, error: err instanceof Error ? err.message : String(err), startedAt, finishedAt: Date.now() };
  }
};

registerNode({
  type: 'graphql',
  label: 'GraphQL',
  description: "Executes a GraphQL query or mutation against an endpoint.",
  category: 'Integration',
  configSchema: schema,
  outputSchema: z.object({ data: z.unknown(), errors: z.unknown().optional(), status: z.number() }),
  execute,
});
