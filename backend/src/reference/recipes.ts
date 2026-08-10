/**
 * Curated, sanitized example workflows. These teach idiom that schemas alone
 * cannot. They use ONLY placeholder values (example.com, {{...}}) — never real
 * URLs, secrets, or user data — because they ship inside the public reference.
 *
 * A test validates every recipe against the workflow schema so a recipe that
 * drifts from the live node contracts fails the build.
 */
export type Recipe = {
  name: string;
  description: string;
  workflow: Record<string, unknown>;
};

export const RECIPES: Recipe[] = [
  {
    name: 'HTTP → Transform → Log',
    description: 'Fetch JSON, reshape it, log a field. The canonical linear pipeline.',
    workflow: {
      id: 'recipe-http-transform-log',
      name: 'HTTP → Transform → Log',
      description: 'Fetch, transform, log.',
      version: 1,
      variables: {},
      layoutDirection: 'TB',
      nodes: [
        { id: 'fetch', type: 'http', name: 'Fetch', config: { url: 'https://example.com/api/items', method: 'GET', headers: '' }, position: { x: 0, y: 0 } },
        { id: 'shape', type: 'transform', name: 'Shape', config: { code: 'return { count: (outputs["fetch"].data.items || []).length };' }, position: { x: 0, y: 160 } },
        { id: 'out', type: 'log', name: 'Log count', config: { message: 'Got {{outputs["shape"].count}} items', level: 'info' }, position: { x: 0, y: 320 } },
      ],
      edges: [
        { id: 'e1', from: 'fetch', to: 'shape' },
        { id: 'e2', from: 'shape', to: 'out' },
      ],
    },
  },
  {
    name: 'Condition branch',
    description: 'Branch on a value using a condition node and its true/false handles.',
    workflow: {
      id: 'recipe-condition-branch',
      name: 'Condition branch',
      description: 'Route on a threshold.',
      version: 1,
      variables: {},
      layoutDirection: 'TB',
      nodes: [
        { id: 'fetch', type: 'http', name: 'Fetch', config: { url: 'https://example.com/api/status', method: 'GET', headers: '' }, position: { x: 0, y: 0 } },
        { id: 'check', type: 'condition', name: 'Healthy?', config: { expression: 'outputs["fetch"].status === 200' }, position: { x: 0, y: 160 } },
        { id: 'ok', type: 'log', name: 'OK', config: { message: 'Service healthy', level: 'info' }, position: { x: -160, y: 320 } },
        { id: 'bad', type: 'send-slack', name: 'Alert', config: { webhookUrl: 'https://hooks.slack.example/T000/B000/XXXX', text: 'Service DOWN' }, position: { x: 160, y: 320 } },
      ],
      edges: [
        { id: 'e1', from: 'fetch', to: 'check' },
        { id: 'e2', from: 'check', to: 'ok', fromHandle: 'true' },
        { id: 'e3', from: 'check', to: 'bad', fromHandle: 'false' },
      ],
    },
  },
  {
    name: 'WhatsApp intake → filesystem queue',
    description: 'Lightweight webhook workflow: enqueue each incoming WhatsApp receipt as a job file with write-file, so heavy processing can be drained serially elsewhere. Pair with a schedule-triggered drainer that takes a lock (see controlFlow.concurrency).',
    workflow: {
      id: 'recipe-whatsapp-intake',
      name: 'WhatsApp receipt intake',
      description: 'Enqueue one job file per incoming receipt; do no heavy work here.',
      version: 1,
      variables: {},
      layoutDirection: 'TB',
      nodes: [
        {
          id: 'job',
          type: 'transform',
          name: 'Build job',
          config: { code: 'return { sender: variables.trigger.sender, media: variables.trigger.media, ts: variables.trigger.timestamp };' },
          position: { x: 0, y: 0 },
        },
        {
          id: 'enqueue',
          type: 'write-file',
          name: 'Enqueue job',
          config: { filename: 'queue/{{outputs["job"].ts}}-{{variables.trigger.pn}}.json', content: '{{outputs["job"]}}', mimeType: 'application/json' },
          position: { x: 0, y: 160 },
        },
        {
          id: 'ack',
          type: 'send-whatsapp',
          name: 'Acknowledge',
          config: { to: '{{trigger.sender}}', text: 'Receipt received — processing shortly.' },
          position: { x: 0, y: 320 },
        },
      ],
      edges: [
        { id: 'e1', from: 'job', to: 'enqueue' },
        { id: 'e2', from: 'enqueue', to: 'ack' },
      ],
    },
  },
  {
    name: 'Filesystem queue drainer (serialized)',
    description: 'Schedule-triggered drainer that processes one queued job per tick. list-files finds the oldest job; move-file atomically claims it (moved:false if another run already took it — lock-free mutual exclusion); read-local-file loads it; then delete-file removes it. Run on a modest cron (e.g. every minute).',
    workflow: {
      id: 'recipe-fs-drainer',
      name: 'Filesystem queue drainer',
      description: 'Process one queued job per tick, serially.',
      version: 1,
      variables: {},
      layoutDirection: 'TB',
      nodes: [
        { id: 'ls', type: 'list-files', name: 'List queue', config: { dir: 'queue', pattern: '*.json' }, position: { x: 0, y: 0 } },
        { id: 'any', type: 'condition', name: 'Any jobs?', config: { expression: 'outputs["ls"].count > 0' }, position: { x: 0, y: 140 } },
        { id: 'claim', type: 'move-file', name: 'Claim oldest', config: { from: '{{outputs["ls"].files[0].path}}', to: 'processing/{{outputs["ls"].files[0].name}}' }, position: { x: 0, y: 280 } },
        { id: 'got', type: 'condition', name: 'Claimed?', config: { expression: 'outputs["claim"].moved === true' }, position: { x: 0, y: 420 } },
        { id: 'read', type: 'read-local-file', name: 'Read job', config: { path: '{{outputs["claim"].to}}', format: 'json' }, position: { x: 0, y: 560 } },
        { id: 'work', type: 'transform', name: 'Process', config: { code: 'log("processing " + outputs["claim"].to); return outputs["read"].content;' }, position: { x: 0, y: 700 } },
        { id: 'done', type: 'delete-file', name: 'Remove job', config: { path: '{{outputs["claim"].to}}' }, position: { x: 0, y: 840 } },
      ],
      edges: [
        { id: 'e1', from: 'ls', to: 'any' },
        { id: 'e2', from: 'any', to: 'claim', fromHandle: 'true' },
        { id: 'e3', from: 'claim', to: 'got' },
        { id: 'e4', from: 'got', to: 'read', fromHandle: 'true' },
        { id: 'e5', from: 'read', to: 'work' },
        { id: 'e6', from: 'work', to: 'done' },
      ],
    },
  },
];
