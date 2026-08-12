// Ported from frontend — identical logic, extended context with scripts.
import { getNode } from './nodeRegistry';
import { resolveString } from './expression';
import { INTERNAL_TOKEN_HEADER, getInternalToken } from '../auth/internalToken';
import type { Workflow, ExecutionContext, NodeId, WorkflowNode, WorkflowEdge, Script } from '../types';

function resolveConfigStrings(config: Record<string, unknown>, context: ExecutionContext): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    if (typeof v === 'string') {
      out[k] = resolveString(v, context);
    } else if (Array.isArray(v)) {
      out[k] = v.map((item) =>
        typeof item === 'string' ? resolveString(item, context)
        : item !== null && typeof item === 'object' ? resolveConfigStrings(item as Record<string, unknown>, context)
        : item
      );
    } else if (v !== null && typeof v === 'object') {
      out[k] = resolveConfigStrings(v as Record<string, unknown>, context);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// Resolved config is reported to the UI and persisted with the run — if a
// field interpolated a secret ({{secrets.X}}), report the original template
// string instead of the resolved value so secrets never land in run history,
// SSE streams, or backups. Node re-runs re-resolve templates, so they still
// work. Values shorter than 4 chars are ignored to avoid trivial matches.
const containsSecretValue = (s: string, secrets: Record<string, string>): boolean =>
  Object.values(secrets).some((v) => typeof v === 'string' && v.length >= 4 && s.includes(v));

function redactSecrets(original: unknown, resolved: unknown, secrets: Record<string, string>): unknown {
  if (typeof resolved === 'string') {
    return resolved !== original && containsSecretValue(resolved, secrets) ? original : resolved;
  }
  if (Array.isArray(resolved)) {
    const orig = Array.isArray(original) ? original : [];
    return resolved.map((item, i) => redactSecrets(orig[i], item, secrets));
  }
  if (resolved !== null && typeof resolved === 'object') {
    const orig = (original !== null && typeof original === 'object' ? original : {}) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(resolved as Record<string, unknown>).map(([k, v]) => [k, redactSecrets(orig[k], v, secrets)])
    );
  }
  return resolved;
}

type ExecutorCallbacks = {
  onNodeStart:    (nodeId: NodeId, nodeName: string, resolvedConfig: Record<string, unknown>, startedAt: number) => void;
  onNodeComplete: (nodeId: NodeId, nodeName: string, status: 'success' | 'error', input: unknown, output: unknown, error: string | undefined, startedAt: number, finishedAt: number) => void;
  onLog:          (msg: string) => void;
};

const isBackEdge = (e: WorkflowEdge): boolean => ['loop', "iterator"].includes(e.fromHandle ?? "");

const getLoopBody = (startId: NodeId, loopNodeId: NodeId, workflow: Workflow): Set<NodeId> => {
  const body  = new Set<NodeId>();
  const stack = [startId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (body.has(id)) continue;
    body.add(id);
    if (id === loopNodeId) continue;
    for (const edge of workflow.edges) {
      if (!isBackEdge(edge) && edge.from === id && !body.has(edge.to)) {
        stack.push(edge.to);
      }
    }
  }
  return body;
};

export const executeWorkflow = async (
  workflow: Workflow,
  scripts: Script[],
  secrets: Record<string, string>,
  callbacks: ExecutorCallbacks,
  initialVariables?: Record<string, unknown>,
  signal?: { cancelled: boolean },
  runId?: string,
): Promise<ExecutionContext> => {
  // Initial variables are exposed both as top-level variables (so callers can
  // pre-populate/override declared workflow variables, and __workflowDepth__
  // propagates to nested runs) and under `trigger` (webhook/schedule payloads).
  const context: ExecutionContext = {
    runId:     runId ?? 'local',
    results:   {},
    variables: { ...workflow.variables, ...initialVariables, trigger: initialVariables ?? null },
    scripts,
    secrets,
    log:       callbacks.onLog,
  };

  // Targets of back-edges (first body node of each loop) — excluded from root detection
  // and their outgoing edges are excluded from initial in-degree so body topology stays clean.
  const backEdgeTargets = new Set(workflow.edges.filter(isBackEdge).map((e) => e.to));

  const inDegree = new Map<NodeId, number>();
  for (const node of workflow.nodes) inDegree.set(node.id, 0);
  for (const edge of workflow.edges) {
    if (!isBackEdge(edge) && !backEdgeTargets.has(edge.from)) {
      inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
    }
  }

  const hasForwardIncoming = new Set(workflow.edges.filter((e) => !isBackEdge(e)).map((e) => e.to));
  const roots = workflow.nodes.filter((n) => !hasForwardIncoming.has(n.id) && !backEdgeTargets.has(n.id));

  if (roots.length === 0 && workflow.nodes.length > 0) {
    callbacks.onLog('Warning: No root nodes found — possible cycle detected');
    return context;
  }

  const visited:      Set<NodeId>               = new Set();
  const nodeMap:      Map<NodeId, WorkflowNode>  = new Map(workflow.nodes.map((n) => [n.id, n]));
  const loopCounts:   Map<NodeId, number>        = new Map();
  const pendingInput: Map<NodeId, unknown>       = new Map();

  const runNode = async (node: WorkflowNode): Promise<void> => {
    if (signal?.cancelled) return;
    if (visited.has(node.id)) return;
    visited.add(node.id);

    // Label nodes are pure canvas decorations — no execution, no edges to process.
    if (node.type === 'label') return;

    // Resolve input from upstream results or pendingInput (shared by junction and normal nodes).
    const inEdges = workflow.edges.filter((e) => e.to === node.id && !isBackEdge(e));
    let nodeInput: unknown = pendingInput.get(node.id) ?? null;
    pendingInput.delete(node.id);
    if (nodeInput === null && inEdges.length === 1) {
      nodeInput = context.results[inEdges[0].from]?.output ?? null;
    } else if (nodeInput === null && inEdges.length > 1) {
      const inputMap: Record<string, unknown> = {};
      for (const edge of inEdges) {
        const up = context.results[edge.from];
        if (up) {
          const upNode = workflow.nodes.find((n) => n.id === edge.from);
          inputMap[upNode?.name ?? edge.from] = up.output;
        }
      }
      nodeInput = inputMap;
    }

    // Junction nodes pass input through silently — no log entry, no handler.
    if (node.type === 'junction') {
      context.results[node.id] = { nodeId: node.id, status: 'success', output: nodeInput, startedAt: 0, finishedAt: 0 };
      const fwdEdges = workflow.edges.filter((e) => e.from === node.id && !isBackEdge(e));
      const next: WorkflowNode[] = [];
      for (const edge of fwdEdges) {
        const deg = (inDegree.get(edge.to) ?? 0) - 1;
        inDegree.set(edge.to, deg);
        if (deg <= 0 && !visited.has(edge.to)) {
          const nb = nodeMap.get(edge.to);
          if (nb) next.push(nb);
        }
      }
      await Promise.all(next.map(runNode));
      return;
    }

    const handler = getNode(node.type);
    if (!handler) {
      callbacks.onLog(`Unknown node type: ${node.type} (id: ${node.id})`);
      return;
    }

    const nodeName = node.name ?? node.type;

    // Disabled nodes are bypassed — input passes through as output.
    if (node.enabled === false) {
      context.results[node.id] = { nodeId: node.id, status: 'success', output: nodeInput, startedAt: Date.now(), finishedAt: Date.now() };
      callbacks.onLog(`⏭ [${nodeName}] skipped (disabled)`);
      const fwdEdges = workflow.edges.filter((e) => e.from === node.id && !isBackEdge(e));
      const toStart: WorkflowNode[] = [];
      for (const edge of fwdEdges) {
        const deg = (inDegree.get(edge.to) ?? 0) - 1;
        inDegree.set(edge.to, deg);
        if (deg <= 0 && !visited.has(edge.to)) {
          const nb = nodeMap.get(edge.to);
          if (nb) toStart.push(nb);
        }
      }
      await Promise.all(toStart.map(runNode));
      return;
    }

    // Per-node context copy so parallel branches don't share context.input.
    const nodeCtx = { ...context, input: nodeInput };
    const startedAt = Date.now();
    let resolvedConfig: Record<string, unknown> = {};
    let result: Awaited<ReturnType<typeof handler.execute>>;
    try {
      resolvedConfig = redactSecrets(
        node.config,
        resolveConfigStrings(node.config, nodeCtx),
        context.secrets,
      ) as Record<string, unknown>;
      callbacks.onNodeStart(node.id, nodeName, resolvedConfig, startedAt);
      const timeoutMs = (typeof node.timeoutSecs === 'number' && node.timeoutSecs > 0 ? node.timeoutSecs : 300) * 1000;
      result = await Promise.race([
        handler.execute(node, nodeCtx),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Node timed out after ${timeoutMs / 1000}s`)), timeoutMs)
        ),
      ]);
    } catch (err) {
      result = {
        nodeId:     node.id,
        status:     'error',
        output:     null,
        error:      err instanceof Error ? err.message : String(err),
        startedAt,
        finishedAt: Date.now(),
      };
    }
    result.input          = nodeInput;
    result.resolvedConfig = resolvedConfig;
    const prev = context.results[node.id];
    if (prev && (prev.status === 'success' || prev.status === 'error')) {
      // Keep only the most recent iterations — a 10k-iteration loop would
      // otherwise snowball the results map (and the persisted run row).
      const { iterations: prevIter, ...prevWithout } = prev;
      result.iterations = [...(prevIter ?? []), prevWithout].slice(-200);
    }
    context.results[node.id] = result;
    callbacks.onNodeComplete(node.id, nodeName, result.status as 'success' | 'error', nodeInput, result.output, result.error, result.startedAt, result.finishedAt);

    if (result.status === 'error') {
      if (workflow.onErrorWorkflowId && workflow.onErrorWorkflowId !== workflow.id) {
        // Depth guard: error handlers that fail can fire their own error handlers;
        // without a ceiling two workflows pointing at each other loop forever.
        const depth = (context.variables.__workflowDepth__ as number | undefined) ?? 0;
        if (depth >= 5) {
          callbacks.onLog('[WARN] Error-handler workflow not fired — max nesting depth reached');
        } else {
          const port = process.env.PORT ?? '3001';
          void fetch(`http://localhost:${port}/workflows/${workflow.onErrorWorkflowId}/run`, {
            method:  'POST',
            headers: {
              'Content-Type': 'application/json',
              [INTERNAL_TOKEN_HEADER]: getInternalToken(),
            },
            body:    JSON.stringify({
              failedNodeId:      node.id,
              failedNodeName:    nodeName,
              error:             result.error ?? 'unknown error',
              parentRunId:       context.runId,
              __workflowDepth__: depth + 1,
            }),
          }).catch((e: unknown) => {
            callbacks.onLog(`[WARN] Error-handler workflow failed to start: ${e instanceof Error ? e.message : String(e)}`);
          });
        }
      }
      return;
    }

    const branch          = (result.output as { branch?: string } | null)?.branch;
    const hasOwnBackEdges = workflow.edges.some((e) => e.from === node.id && isBackEdge(e));
    const shouldContinue  = (result.output as { continue?: boolean } | null)?.continue === true;

    if (hasOwnBackEdges && shouldContinue) {
      const prevCount      = loopCounts.get(node.id) ?? 0;
      const maxIter        = Math.max(1, Number((node.config as { maxIterations?: unknown })?.maxIterations ?? 100));
      const tolerateFailures = (node.config as { tolerateFailures?: boolean })?.tolerateFailures !== false;
      if (prevCount < maxIter - 1) {
        loopCounts.set(node.id, prevCount + 1);
        visited.delete(node.id);
        const backEdges = workflow.edges.filter((e) => e.from === node.id && isBackEdge(e));
        let bodyFailed = false;
        for (const edge of backEdges) {
          const loopBody = getLoopBody(edge.to, node.id, workflow);
          for (const bodyId of loopBody) visited.delete(bodyId);
          const target = nodeMap.get(edge.to);
          if (target) {
            pendingInput.set(target.id, result.output);
            await runNode(target); // await entire body before re-evaluating loop
            if (!tolerateFailures && [...loopBody].some((id) => context.results[id]?.status === 'error')) {
              bodyFailed = true;
            }
          }
        }
        if (bodyFailed) {
          callbacks.onLog(`[${node.name ?? node.type}] iteration aborted — body node failed`);
          // Fall through to fire exit edges
        } else {
          await runNode(node); // re-evaluate loop condition
          return;             // skip forward edge processing for this iteration
        }
      } else {
        callbacks.onLog(`Loop [${node.name ?? node.type}] reached maxIterations (${maxIter}), stopping`);
        // Fall through to fire exit edges
      }
    }

    const forwardEdges = workflow.edges.filter((e) => e.from === node.id && !isBackEdge(e));
    const toStart: WorkflowNode[] = [];
    for (const edge of forwardEdges) {
      if (edge.fromHandle && branch !== undefined && edge.fromHandle !== branch) continue;
      const deg = (inDegree.get(edge.to) ?? 0) - 1;
      inDegree.set(edge.to, deg);
      if (deg <= 0 && !visited.has(edge.to)) {
        const neighbor = nodeMap.get(edge.to);
        if (neighbor) toStart.push(neighbor);
      }
    }
    await Promise.all(toStart.map(runNode));
  };

  await Promise.all(roots.map(runNode));
  return context;
};
