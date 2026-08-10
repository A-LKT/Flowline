/**
 * One-shot codemod: enrich each backend node's registerNode() call with AI
 * reference metadata (description, category, outputSchema, handles), reusing the
 * file's existing config schema const so config schemas never drift.
 *
 * Idempotent: skips files whose registerNode call is already multi-line/enriched.
 * Run once, then delete. Not part of the build.
 */
import fs from 'fs';
import path from 'path';

type Meta = {
  description: string;
  category: string;
  /** name of the in-file zod const to use as configSchema, or null if none */
  configRef: string | null;
  /** zod expression string for outputSchema, or null to omit */
  outputSchema: string | null;
  handles?: string[];
};

const NODES_DIR = path.resolve(__dirname, '../src/nodes');

const META: Record<string, Meta> = {
  aggregate:        { description: 'Reduces an array to a single value (count, sum, avg, min, max, first, last, join).', category: 'Data', configRef: 'schema', outputSchema: 'z.object({ result: z.unknown(), operation: z.string(), count: z.number() })' },
  condition:        { description: 'Evaluates a JS expression and routes to the `true` or `false` handle.', category: 'Logic', configRef: 'schema', outputSchema: 'z.object({ result: z.boolean(), branch: z.enum(["true","false"]) })', handles: ['true', 'false'] },
  datetime:         { description: 'Returns the current date/time, optionally offset, in date|time|datetime mode.', category: 'Data', configRef: 'schema', outputSchema: 'z.object({ value: z.string(), iso: z.string(), timestamp: z.number() })' },
  delay:            { description: 'Pauses execution for a fixed number of milliseconds (max 300000).', category: 'Control', configRef: 'schema', outputSchema: 'z.object({ waited: z.number() })' },
  failure:          { description: 'Always fails — for testing error handlers and error-handler workflows.', category: 'Control', configRef: null, outputSchema: null },
  filter:           { description: 'Filters an array by a predicate expression (scope: item, index, array).', category: 'Data', configRef: 'schema', outputSchema: 'z.object({ result: z.array(z.unknown()), count: z.number(), total: z.number() })' },
  fork:             { description: 'Like Condition but rendered as a diamond. Routes to `true`/`false` handle.', category: 'Logic', configRef: 'schema', outputSchema: 'z.object({ result: z.boolean(), branch: z.enum(["true","false"]) })', handles: ['true', 'false'] },
  'format-csv':     { description: 'Converts an array of objects to a CSV string (header from first object).', category: 'File', configRef: 'schema', outputSchema: 'z.object({ csv: z.string(), rows: z.number() })' },
  graphql:          { description: 'Executes a GraphQL query or mutation against an endpoint.', category: 'Integration', configRef: 'schema', outputSchema: 'z.object({ data: z.unknown(), errors: z.unknown().optional(), status: z.number() })' },
  http:             { description: 'Sends an HTTP request (GET/POST/PUT/DELETE/PATCH) and returns the response.', category: 'Integration', configRef: 'schema', outputSchema: 'z.object({ status: z.number(), data: z.unknown(), url: z.string() })' },
  iterator:         { description: 'Iterates an array/object, emitting one item per pass through the `iterator` body handle until exhausted, then the `done` handle. Loop via a back-edge with fromHandle "iterator".', category: 'Logic', configRef: 'schema', outputSchema: 'z.object({ continue: z.boolean(), index: z.number().optional(), item: z.unknown().optional() })', handles: ['iterator', 'done'] },
  label:            { description: 'Decorative canvas annotation. No execution, no edges.', category: 'Control', configRef: null, outputSchema: null },
  log:              { description: 'Writes a message to the run log at info|warn|error. Passes input through.', category: 'Control', configRef: 'schema', outputSchema: 'z.object({ message: z.string(), level: z.string() })' },
  loop:             { description: 'Repeats the `loop` body while the condition stays true, then fires `done`. Loop via a back-edge with fromHandle "loop". maxIterations default 100.', category: 'Logic', configRef: 'schema', outputSchema: 'z.object({ continue: z.boolean(), iteration: z.number() })', handles: ['loop', 'done'] },
  math:             { description: 'Evaluates a math expression (Math, Number, parseInt/parseFloat in scope).', category: 'Data', configRef: 'schema', outputSchema: 'z.object({ result: z.number() })' },
  'parse-csv':      { description: 'Parses a CSV string into an array of row objects (first row = header).', category: 'File', configRef: 'schema', outputSchema: 'z.object({ rows: z.array(z.record(z.unknown())), count: z.number() })' },
  ping:             { description: 'Sends an ICMP echo to a host and reports reachability and latency.', category: 'Integration', configRef: 'schema', outputSchema: 'z.object({ ok: z.boolean(), host: z.string(), latency: z.number().nullable() })' },
  'read-file':      { description: 'Fetches a resource from a URL as text|json|base64.', category: 'File', configRef: 'schema', outputSchema: 'z.object({ content: z.unknown(), size: z.number(), url: z.string(), format: z.string() })' },
  'render-template':{ description: 'Interpolates a template string using {{expression}} placeholders.', category: 'Data', configRef: 'schema', outputSchema: 'z.object({ text: z.string() })' },
  'run-workflow':   { description: 'Runs another workflow. sync: returns child results map; async: returns {runId, mode}. Max nesting depth 5.', category: 'Control', configRef: 'configSchema', outputSchema: 'z.unknown()' },
  script:           { description: 'Runs a named Script (from the Scripts space). Returns the script return value. Sandboxed scripts run in Docker and can emit files.', category: 'Logic', configRef: 'schema', outputSchema: 'z.unknown()' },
  'send-email':     { description: 'Posts an email payload to a configured HTTP email relay (SendGrid/Mailgun/etc).', category: 'Notification', configRef: 'schema', outputSchema: 'z.object({ sent: z.boolean(), to: z.string(), subject: z.string(), status: z.number() })' },
  'send-slack':     { description: 'Posts a message to a Slack Incoming Webhook URL.', category: 'Notification', configRef: 'schema', outputSchema: 'z.object({ sent: z.boolean(), text: z.string() })' },
  'send-teams':     { description: 'Posts a MessageCard to a Microsoft Teams Incoming Webhook URL.', category: 'Notification', configRef: 'schema', outputSchema: 'z.object({ sent: z.boolean(), title: z.string(), text: z.string() })' },
  'send-whatsapp':  { description: 'Sends a WhatsApp message (text, or image via imageUrl+caption) through the local WhatsApp bridge. Reply with to: {{trigger.sender}}.', category: 'Notification', configRef: 'schema', outputSchema: 'z.object({ to: z.string(), text: z.string().optional(), imageUrl: z.string().optional(), caption: z.string().optional() })' },
  'set-variable':   { description: 'Creates or updates a workflow variable visible to all downstream nodes.', category: 'Control', configRef: 'schema', outputSchema: 'z.object({ name: z.string(), value: z.unknown() })' },
  sort:             { description: 'Sorts an array of objects by a field, ascending or descending.', category: 'Data', configRef: 'schema', outputSchema: 'z.object({ result: z.array(z.unknown()), count: z.number() })' },
  switch:           { description: 'Routes to a case handle (1-4) by matching the expression value, else `default`. The matched handle id is in output.branch.', category: 'Logic', configRef: 'schema', outputSchema: 'z.object({ branch: z.string(), value: z.string() })', handles: ['1', '2', '3', '4', 'default'] },
  transform:        { description: 'Runs arbitrary JS (outputs, variables, log in scope) and returns the result.', category: 'Data', configRef: 'schema', outputSchema: 'z.unknown()' },
  'write-file':     { description: 'Writes a file to the server data directory (basename only) and returns its path. Served under /files/.', category: 'File', configRef: 'schema', outputSchema: 'z.object({ filename: z.string(), size: z.number(), path: z.string() })' },
};

const buildBlock = (type: string, label: string, m: Meta): string => {
  const lines: string[] = ['registerNode({', `  type: '${type}',`, `  label: '${label}',`];
  lines.push(`  description: ${JSON.stringify(m.description)},`);
  lines.push(`  category: '${m.category}',`);
  if (m.configRef) lines.push(`  configSchema: ${m.configRef},`);
  if (m.outputSchema) lines.push(`  outputSchema: ${m.outputSchema},`);
  if (m.handles) lines.push(`  handles: ${JSON.stringify(m.handles)},`);
  lines.push('  execute,');
  lines.push('});');
  return lines.join('\n');
};

let changed = 0;
const skipped: string[] = [];

for (const file of fs.readdirSync(NODES_DIR)) {
  if (!file.endsWith('Node.ts')) continue;
  const full = path.join(NODES_DIR, file);
  let text = fs.readFileSync(full, 'utf8');

  // Match the single-line registerNode call.
  const re = /registerNode\(\{ type: '([^']+)', label: '([^']+)', execute \}\);/;
  const match = text.match(re);
  if (!match) { skipped.push(`${file} (no single-line registerNode)`); continue; }

  const [, type, label] = match;
  const m = META[type];
  if (!m) { skipped.push(`${file} (no META for '${type}')`); continue; }

  text = text.replace(re, buildBlock(type, label, m));
  fs.writeFileSync(full, text, 'utf8');
  changed++;
  console.log(`enriched ${file} (${type})`);
}

console.log(`\nChanged ${changed} files.`);
if (skipped.length) console.log('Skipped:\n  ' + skipped.join('\n  '));
