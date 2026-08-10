/**
 * AI Capability Reference — generator.
 *
 * Produces a machine-readable description of *what the workflow engine can do*,
 * derived at request time from the live in-memory registries that actually
 * execute workflows. Because it is a pure projection of those registries, the
 * reference can never drift from the engine: add a node, it appears here.
 *
 * SECURITY INVARIANT: this module must never import `../db` or read any user
 * data. It exposes capability *shapes* only — never workflow contents, rows,
 * triggers, secrets, or run history. A test enforces the no-db-import rule.
 */
import { z, type ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { getAllNodes } from '../engine/nodeRegistry';
import { TRIGGER_KINDS, TRIGGER_VARIABLES } from './triggers';
import {
  workflowSchema, workflowNodeSchema, workflowEdgeSchema,
  CONTROL_FLOW, EXPRESSIONS, SCRIPTS, OVERVIEW,
} from './contracts';
import { RECIPES, type Recipe } from './recipes';

export const REFERENCE_VERSION = 1;

const toJsonSchema = (schema: ZodTypeAny | undefined): unknown =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema ? zodToJsonSchema(schema as any, { target: 'jsonSchema7', $refStrategy: 'none' }) : undefined;

export type NodeTypeReference = {
  type: string;
  label: string;
  category: string;
  description: string;
  /** Source handles for edges (`edge.fromHandle`). Empty = single default output. */
  handles: string[];
  plugin: string | null;
  configSchema: unknown;
  outputSchema: unknown;
};

export type TriggerKindReferenceJson = {
  kind: string;
  description: string;
  configSchema: unknown;
  notes?: string;
};

export type CapabilityReference = {
  referenceVersion: number;
  engineVersion: string;
  generatedAt: string;
  overview: string;
  /** Counts let a client cheaply detect that the capability set changed. */
  counts: { nodeTypes: number; triggerKinds: number; recipes: number };
  workflowFormat: {
    workflow: unknown;
    node: unknown;
    edge: unknown;
    notes: string[];
  };
  controlFlow: typeof CONTROL_FLOW;
  expressions: typeof EXPRESSIONS;
  scripts: typeof SCRIPTS;
  nodeTypes: NodeTypeReference[];
  triggerKinds: TriggerKindReferenceJson[];
  triggerVariables: typeof TRIGGER_VARIABLES;
  recipes: Recipe[];
};

const engineVersion = (): string => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return (require('../../package.json') as { version?: string }).version ?? '0.0.0';
  } catch {
    return process.env.npm_package_version ?? '0.0.0';
  }
};

const buildNodeTypes = (): NodeTypeReference[] =>
  getAllNodes()
    .map((def) => ({
      type: def.type,
      label: def.label ?? def.type,
      category: def.category ?? 'Uncategorized',
      description: def.description ?? '',
      handles: def.handles ?? [],
      plugin: def.plugin ?? null,
      configSchema: toJsonSchema(def.configSchema),
      outputSchema: toJsonSchema(def.outputSchema),
    }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.type.localeCompare(b.type));

const buildTriggerKinds = (): TriggerKindReferenceJson[] =>
  TRIGGER_KINDS.map((t) => ({
    kind: t.kind,
    description: t.description,
    configSchema: toJsonSchema(t.configSchema),
    notes: t.notes,
  }));

export const buildCapabilityReference = (): CapabilityReference => {
  const nodeTypes = buildNodeTypes();
  const triggerKinds = buildTriggerKinds();
  return {
    referenceVersion: REFERENCE_VERSION,
    engineVersion: engineVersion(),
    generatedAt: new Date().toISOString(),
    overview: OVERVIEW,
    counts: { nodeTypes: nodeTypes.length, triggerKinds: triggerKinds.length, recipes: RECIPES.length },
    workflowFormat: {
      workflow: toJsonSchema(workflowSchema),
      node: toJsonSchema(workflowNodeSchema),
      edge: toJsonSchema(workflowEdgeSchema),
      notes: [
        'Emit the workflow as a JSON file; the user imports it via Workflows → Import (a fresh id is assigned).',
        'node.config must satisfy the matching nodeTypes[].configSchema. String fields support {{expressions}}.',
        'Wire branches and loops via edge.fromHandle per controlFlow.',
      ],
    },
    controlFlow: CONTROL_FLOW,
    expressions: EXPRESSIONS,
    scripts: SCRIPTS,
    nodeTypes,
    triggerKinds,
    triggerVariables: TRIGGER_VARIABLES,
    recipes: RECIPES,
  };
};

// Re-exported so the no-data guarantee is greppable: this module touches only zod.
export const __referenceUsesOnly = { z };
