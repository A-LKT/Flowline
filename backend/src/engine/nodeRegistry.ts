import type { ZodTypeAny } from 'zod';
import type { WorkflowNode, ExecutionContext, NodeExecutionResult } from '../types';

/**
 * A node definition. `execute` is the only field required to run a node; the
 * remaining fields are *reference metadata* consumed by the AI capability
 * reference (see ../reference). They are co-located here, next to the
 * execution logic, so the reference can never describe a node that does not
 * exist or has a different contract than what actually runs.
 *
 * Phase 0 ships the type. Phase 1 populates the metadata on every node.
 */
export type NodeDefinition = {
  type: string;
  label?: string;

  /** One-line human/LLM description of what the node does. */
  description?: string;
  /** Palette grouping, e.g. "Logic", "Data", "Integration". */
  category?: string;
  /** Owning plugin name, when the node comes from a plugin. */
  plugin?: string;
  /** Zod schema for `node.config`. Surfaced to the AI as JSON Schema. */
  configSchema?: ZodTypeAny;
  /** Zod schema describing the node's `output` object. */
  outputSchema?: ZodTypeAny;
  /**
   * Source output handles, used as `edge.fromHandle`. Omit (or `[]`) for the
   * single default output. Branch nodes list every handle, e.g.
   * `['true','false']`, `['1','2','3','4','default']`, `['loop','done']`.
   */
  handles?: string[];

  execute: (node: WorkflowNode, context: ExecutionContext) => Promise<NodeExecutionResult>;
};

const registry = new Map<string, NodeDefinition>();

export const registerNode = (def: NodeDefinition): void => {
  registry.set(def.type, def);
};

export const getNode = (type: string): NodeDefinition | undefined => registry.get(type);

/** Every registered node, in registration order. Source of truth for the reference. */
export const getAllNodes = (): NodeDefinition[] => Array.from(registry.values());
