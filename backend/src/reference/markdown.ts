/**
 * Renders the capability reference as Markdown — the LLM-pasteable surface.
 * Generated from the same CapabilityReference object as the JSON endpoint, so
 * the two can never disagree.
 */
import type { CapabilityReference, NodeTypeReference } from './capabilities';

const fence = (obj: unknown): string =>
  obj === undefined ? '_(none)_' : '```json\n' + JSON.stringify(obj, null, 2) + '\n```';

const renderNode = (n: NodeTypeReference): string => {
  const lines: string[] = [];
  lines.push(`#### ${n.label} \`${n.type}\``);
  if (n.plugin) lines.push(`> Plugin: \`${n.plugin}\``);
  if (n.description) lines.push('', n.description);
  if (n.handles.length > 0) {
    lines.push('', `**Output handles** (use as \`edge.fromHandle\`): ${n.handles.map((h) => `\`${h}\``).join(', ')}`);
  }
  lines.push('', '**Config:**', fence(n.configSchema));
  lines.push('', '**Output:**', fence(n.outputSchema));
  return lines.join('\n');
};

const kv = (obj: Record<string, unknown>): string =>
  Object.entries(obj)
    .map(([k, v]) => `- **${k}**: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join('\n');

export const renderReferenceMarkdown = (ref: CapabilityReference): string => {
  const out: string[] = [];
  out.push('# Flowline — AI Capability Reference');
  out.push('');
  out.push(
    `> Generated live from the running engine. Engine version \`${ref.engineVersion}\`, ` +
      `reference schema v${ref.referenceVersion}, generated ${ref.generatedAt}.`,
  );
  out.push(
    '> This document is produced at request time from the engine\'s node registry. ' +
      'It describes capabilities only — it contains no workflows, data, or secrets.',
  );
  out.push('');
  out.push('## How to use this reference');
  out.push('');
  out.push(ref.overview);
  out.push('');

  // Workflow file format.
  out.push('## Workflow file format');
  out.push('');
  out.push('**Workflow envelope:**', fence(ref.workflowFormat.workflow));
  out.push('', '**Node:**', fence(ref.workflowFormat.node));
  out.push('', '**Edge:**', fence(ref.workflowFormat.edge));
  out.push('', ...ref.workflowFormat.notes.map((n) => `- ${n}`));
  out.push('');

  // Control flow.
  out.push('## Control flow & routing');
  out.push('');
  out.push(kv(ref.controlFlow as unknown as Record<string, unknown>));
  out.push('');

  // Expressions.
  out.push('## Expressions');
  out.push('');
  out.push(`- **interpolation**: ${ref.expressions.interpolation}`);
  out.push(`- **scope**:`);
  out.push(`  - ${ref.expressions.scope.outputs}`);
  out.push(`  - ${ref.expressions.scope.variables}`);
  out.push(`  - ${ref.expressions.scope.log}`);
  out.push('', '| Context | Syntax | Example |', '|---|---|---|');
  for (const c of ref.expressions.contexts) out.push(`| ${c.context} | ${c.syntax} | \`${c.example}\` |`);
  out.push('', `> ${ref.expressions.note}`);
  out.push('');

  // Scripts.
  out.push('## Scripts');
  out.push('');
  out.push(ref.scripts.description, '', ref.scripts.signature, '', '**Metadata:**', kv(ref.scripts.metadata));
  out.push('', `> ${ref.scripts.note}`);
  out.push('');

  // Group nodes by category.
  const byCategory = new Map<string, NodeTypeReference[]>();
  for (const n of ref.nodeTypes) {
    const list = byCategory.get(n.category) ?? [];
    list.push(n);
    byCategory.set(n.category, list);
  }

  out.push(`## Node types (${ref.counts.nodeTypes})`);
  out.push('');
  for (const [category, nodes] of [...byCategory.entries()].sort()) {
    out.push(`### ${category}`);
    out.push('');
    for (const n of nodes) {
      out.push(renderNode(n));
      out.push('');
    }
  }

  // Triggers.
  out.push(`## Triggers (${ref.counts.triggerKinds})`);
  out.push('');
  out.push(
    '> Each trigger fires a target workflow. You MAY propose a trigger with `propose_artifact` ' +
      '(`kind: "trigger"`); the user applies it just like a workflow. The proposed JSON is a full ' +
      'trigger: top-level `name`, `kind`, `enabled`, a `config` object (see each kind below), and ' +
      '`target: { "type": "workflow", "id": "<the workflow\'s NAME>" }` — `target` and `config` are ' +
      'siblings, not nested. A trigger MUST target an existing workflow, so when you also propose the ' +
      'workflow this turn, set `target.id` to that workflow\'s **name**: it is resolved to the real id ' +
      'on Apply. Tell the user to apply the workflow first, then the trigger.',
  );
  out.push('');
  for (const t of ref.triggerKinds) {
    out.push(`### ${t.kind}`);
    out.push('', t.description);
    out.push('', '**Config:**', fence(t.configSchema));
    if (t.notes) out.push('', `> ${t.notes}`);
    out.push('');
  }

  // Trigger variables.
  out.push('### Trigger variables (`variables.trigger`)');
  out.push('', ref.triggerVariables.webhook.description);
  out.push('', `**WhatsApp bridge** — ${ref.triggerVariables.whatsapp.description}`);
  out.push(kv(ref.triggerVariables.whatsapp.fields));
  out.push('');

  // Recipes.
  out.push(`## Recipes (${ref.counts.recipes})`);
  out.push('');
  out.push('> Known-good, sanitized example workflows. Use as patterns; replace placeholder values.');
  out.push('');
  for (const r of ref.recipes) {
    out.push(`### ${r.name}`);
    out.push('', r.description);
    out.push('', fence(r.workflow));
    out.push('');
  }

  return out.join('\n');
};
