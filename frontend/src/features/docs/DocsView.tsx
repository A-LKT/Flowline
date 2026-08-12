import React, { useState, useRef, useEffect } from 'react';
import { AppHeader } from '../../components/AppHeader';
import { getAllNodes } from '../../engine/nodeRegistry';
import { nodeExtras } from './nodeExtras';
import { navigate as routeNavigate } from '../../state/route';
import type { NodeDefinition } from '../../types/node';

// ─── Search corpus ───────────────────────────────────────────────────────────

interface SearchEntry {
  pageId: string;
  pageLabel: string;
  text: string;
}

const STATIC_CORPUS: SearchEntry[] = [
  { pageId: 'introduction', pageLabel: 'Introduction', text: 'workflow engine visual node-based automation platform building blocks drag-and-drop canvas directed edges topological order parallel branches SQLite Fastify backend persistence variables scripts triggers runs spaces workflows scripts triggers docs secrets jobs datastore admin' },
  { pageId: 'getting-started', pageLabel: 'Getting Started', text: 'create workflow new canvas add nodes palette double-click node picker connect handles edges configure config panel expression interpolation run inspect results save unsaved indicator import export JSON first useful workflow HTTP Request Log' },
  { pageId: 'concepts-workflows', pageLabel: 'Workflows', text: 'workflow versioned named directed graph entrypoint nodes edges variables layout direction auto-layout Sugiyama clone import export version increment lifecycle create edit save run inspect results TB LR onErrorWorkflowId error handler fallback workflow' },
  { pageId: 'concepts-nodes', pageLabel: 'Nodes & Edges', text: 'node type id name description config position handles edges fork condition switch loop execution order topological parallel concurrent status idle running success error copy paste cut select canvas Logic Control Data File Integration Notification Data Store Run Workflow categories' },
  { pageId: 'concepts-variables', pageLabel: 'Variables & Expressions', text: 'variables expressions outputs node outputs context scope set variable read write workflow run key value store flat JavaScript expression interpolation template syntax coercion undefined outputs["nodeId"] variables.name' },
  { pageId: 'concepts-scripts', pageLabel: 'Scripts', text: 'scripts reusable JavaScript function Monaco editor input bindings context outputs variables log timeout synchronous Script node shared global multiple workflows' },
  { pageId: 'concepts-triggers', pageLabel: 'Triggers', text: 'triggers schedule cron webhook HTTP POST HMAC secret X-Webhook-Signature X-Hub-Signature-256 enabled disabled payload variables.trigger timezone cron expression minute hour day month weekday' },
  { pageId: 'concepts-simulation', pageLabel: 'Running Workflows', text: 'run running workflow jobs history log execution canvas debug live status badges node results timing start finish queued running success error cancelled cancel terminate stop inspect config unsaved changes included replay review' },
  { pageId: 'guide-datastore', pageLabel: 'Data Store', text: 'data store table column row key upsert insert update query filter limit schema JSON export SQL datastore-query datastore-upsert tables manage CRUD persistent structured storage' },
  { pageId: 'guide-jobs',     pageLabel: 'Jobs',         text: 'jobs view run history live status queued running success error cancelled pagination filter workflow replay canvas replay run detail logs results timing trigger type schedule webhook manual' },
  { pageId: 'guide-run-workflow', pageLabel: 'Run Workflow Node', text: 'run workflow node sub-workflow child workflow sync async mode variables depth guard nesting recursive MAX_DEPTH fire and forget wait result' },
  { pageId: 'guide-whatsapp', pageLabel: 'WhatsApp Bridge', text: 'whatsapp bridge baileys QR code scan command /voicelog trigger.sender trigger.content trigger.command trigger.args trigger.media send-whatsapp reply ALLOW_FROM WEBHOOK_SECRET WHATSAPP_BRIDGE_URL docker compose wa_auth wa_media' },
  { pageId: 'guide-plugins',  pageLabel: 'Plugin Modules',  text: 'plugin module drop-in custom node service voice to text transcribe audio AI category backend frontend registry manifest PluginManifest VOICE_TO_TEXT_URL compose snippet getPluginServices ServiceStatus health check integration extend add new node' },
  { pageId: 'guide-ai',       pageLabel: 'AI Completion',   text: 'AI completion OpenAI ChatGPT Anthropic Claude Perplexity LLM language model prompt system temperature maxTokens secrets OPENAI_API_KEY ANTHROPIC_API_KEY PERPLEXITY_API_KEY provider model text generation backend node ollama vision image local' },
  { pageId: 'guide-admin',    pageLabel: 'Admin & Backup',  text: 'admin backup restore export import workflows scripts triggers runs secrets JSON backup file dataset select all plaintext warning vault key maintenance pruning' },
  { pageId: 'shortcuts', pageLabel: 'Keyboard Shortcuts', text: 'shortcuts keyboard Ctrl+S save Ctrl+Z undo Ctrl+R redo Ctrl+C copy Ctrl+X cut Ctrl+V paste Delete Backspace Escape Ctrl+A select all rectangle select scroll zoom pan drag Monaco autocomplete format comment duplicate line' },
];

function buildNodeCorpus(): SearchEntry[] {
  return getAllNodes().map((def) => {
    const extra = nodeExtras[def.type];
    const text = [
      def.label, def.type, def.description, def.category,
      extra?.longDescription ?? '',
      extra?.tips?.join(' ') ?? '',
      extra?.outputShape ?? '',
    ].join(' ');
    return { pageId: `ref-${def.category}`, pageLabel: def.label, text };
  });
}

const FULL_CORPUS: SearchEntry[] = [...STATIC_CORPUS, ...buildNodeCorpus()];

function getSnippet(text: string, query: string): string {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, 90) + (text.length > 90 ? '…' : '');
  const start = Math.max(0, idx - 30);
  const end = Math.min(text.length, idx + query.length + 60);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

function doSearch(query: string): SearchEntry[] {
  if (query.length < 2) return [];
  const q = query.toLowerCase();
  return FULL_CORPUS.filter(
    (e) => e.pageLabel.toLowerCase().includes(q) || e.text.toLowerCase().includes(q)
  ).slice(0, 10);
}

// ─── Navigation ──────────────────────────────────────────────────────────────

interface NavItem {
  id: string;
  label: string;
  sectionHeader?: string;
}

const NAV: NavItem[] = [
  { id: 'introduction',        label: 'Introduction' },
  { id: 'getting-started',     label: 'Getting Started' },
  { id: 'concepts-workflows',  label: 'Workflows',              sectionHeader: 'Core Concepts' },
  { id: 'concepts-nodes',      label: 'Nodes & Edges' },
  { id: 'concepts-variables',  label: 'Variables & Expressions' },
  { id: 'concepts-scripts',    label: 'Scripts' },
  { id: 'concepts-triggers',   label: 'Triggers' },
  { id: 'concepts-simulation', label: 'Running Workflows' },
  { id: 'guide-datastore',     label: 'Data Store',             sectionHeader: 'Guides' },
  { id: 'guide-jobs',          label: 'Jobs' },
  { id: 'guide-run-workflow',  label: 'Run Workflow Node' },
  { id: 'guide-whatsapp',      label: 'WhatsApp Bridge' },
  { id: 'guide-plugins',       label: 'Plugin Modules' },
  { id: 'guide-ai',            label: 'AI Completion' },
  { id: 'guide-admin',         label: 'Admin & Backup' },
  { id: 'ref-Logic',           label: 'Logic',                  sectionHeader: 'Node Reference' },
  { id: 'ref-Control',         label: 'Control' },
  { id: 'ref-Data',            label: 'Data' },
  { id: 'ref-Data Store',      label: 'Data Store' },
  { id: 'ref-File',            label: 'File' },
  { id: 'ref-Integration',     label: 'Integration' },
  { id: 'ref-Notification',    label: 'Notification' },
  { id: 'ref-AI',              label: 'AI' },
  { id: 'shortcuts',           label: 'Keyboard Shortcuts',     sectionHeader: 'Reference' },
];

// ─── Shared primitives ────────────────────────────────────────────────────────

const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="docs-code">{children}</code>
);

const Pre = ({ children }: { children: string }) => (
  <pre className="docs-pre">{children}</pre>
);

const Callout = ({ warn, children }: { warn?: boolean; children: React.ReactNode }) => (
  <div className={`docs-callout${warn ? ' docs-callout--warn' : ''}`}>
    <p>{children}</p>
  </div>
);

const Kbd = ({ children }: { children: string }) => (
  <kbd className="docs-kbd">{children}</kbd>
);

const Badge = ({ variant, children }: { variant?: 'category'; children: string }) => (
  <span className={`docs-badge${variant ? ` docs-badge--${variant}` : ''}`}>{children}</span>
);

// ─── Node reference card ──────────────────────────────────────────────────────

function NodeCard({ def }: { def: NodeDefinition }) {
  const extra = nodeExtras[def.type];
  const configKeys = Object.keys(def.defaultConfig ?? {});

  return (
    <div className="docs-node-card">
      <div className="docs-node-header">
        <span className="docs-node-title">{def.label}</span>
        <Badge variant="category">{def.category}</Badge>

        <span className="docs-node-type">{def.type}</span>
      </div>
      <div className="docs-node-body">
        <p>{extra?.longDescription ?? def.description}</p>

        {configKeys.length > 0 && (
          <>
            <h3>Configuration</h3>
            <table className="docs-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Type</th>
                  <th>Default</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {configKeys.map((key) => {
                  const meta = (def.fieldMeta as Record<string, { type?: string; options?: string[] }> | undefined)?.[key];
                  const defaultVal = def.defaultConfig?.[key];
                  const fieldType = meta?.type ?? (typeof defaultVal === 'boolean' ? 'checkbox' : typeof defaultVal === 'number' ? 'number' : 'text');
                  const options = meta?.options ? meta.options.join(' | ') : '';
                  return (
                    <tr key={key}>
                      <td><Code>{key}</Code></td>
                      <td>{fieldType}{options ? ` (${options})` : ''}</td>
                      <td>{defaultVal !== undefined && defaultVal !== '' ? String(defaultVal) : '—'}</td>
                      <td>{key === 'headers' ? 'JSON object of key/value pairs' : key === 'body' ? 'Raw string payload' : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}

        {extra?.outputShape && (
          <>
            <h3>Output</h3>
            <Pre>{extra.outputShape}</Pre>
          </>
        )}

        {extra?.tips && extra.tips.length > 0 && (
          <>
            <h3>Tips</h3>
            <ul>
              {extra.tips.map((tip, i) => <li key={i}>{tip}</li>)}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Page content ─────────────────────────────────────────────────────────────

function PageIntroduction() {
  return (
    <div className="docs-page">
      <h1>Flowline</h1>
      <p className="docs-page-subtitle">
        A visual, node-based automation platform for building, running, and monitoring multi-step workflows.
      </p>

      <h2>What is it?</h2>
      <p>
        Flowline lets you wire together reusable building blocks — called <strong>nodes</strong> — on
        a drag-and-drop canvas to define automated processes. Nodes communicate by passing data along
        directed edges. A workflow can read from APIs, transform data, make decisions, loop over collections,
        send notifications, and more — all without writing a deployment pipeline.
      </p>

      <h2>Key concepts at a glance</h2>
      <table className="docs-table">
        <thead>
          <tr><th>Concept</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><strong>Workflow</strong></td><td>A named, versioned graph of nodes and edges.</td></tr>
          <tr><td><strong>Node</strong></td><td>A typed building block that performs one unit of work.</td></tr>
          <tr><td><strong>Edge</strong></td><td>A directed connection that carries data from one node to the next.</td></tr>
          <tr><td><strong>Variable</strong></td><td>A named value shared across an entire workflow run.</td></tr>
          <tr><td><strong>Script</strong></td><td>A reusable JavaScript function callable from any Script node.</td></tr>
          <tr><td><strong>Trigger</strong></td><td>A schedule or webhook that starts a workflow automatically.</td></tr>
          <tr><td><strong>Run</strong></td><td>A single execution instance with its own results and logs.</td></tr>
        </tbody>
      </table>

      <h2>Spaces</h2>
      <p>The home screen provides eight top-level spaces:</p>
      <table className="docs-table">
        <thead><tr><th>Space</th><th>Purpose</th></tr></thead>
        <tbody>
          <tr><td><strong>Workflows</strong></td><td>Build and run automation graphs on the canvas.</td></tr>
          <tr><td><strong>Scripts</strong></td><td>Write reusable JavaScript functions for Script nodes.</td></tr>
          <tr><td><strong>Triggers</strong></td><td>Schedule workflows or expose them as webhooks.</td></tr>
          <tr><td><strong>Data Store</strong></td><td>Manage persistent user-defined tables — create, edit, and inspect rows.</td></tr>
          <tr><td><strong>Jobs</strong></td><td>Browse run history, inspect results and logs, and replay past runs on the canvas.</td></tr>
          <tr><td><strong>Secrets</strong></td><td>Store encrypted credentials used by backend nodes.</td></tr>
          <tr><td><strong>Documentation</strong></td><td>This documentation space.</td></tr>
          <tr><td><strong>Admin</strong></td><td>System backup, restore, run statistics, and service health.</td></tr>
        </tbody>
      </table>

      <h2>Execution model</h2>
      <p>
        Nodes execute in topological order. Independent branches run concurrently using
        <Code>Promise.all</Code> — a workflow with parallel arms executes them simultaneously on the
        backend worker thread. When a branch node (Condition, Fork, Switch) fires, only the matching
        branch continues. The results of each node are stored in an immutable results map for the
        duration of the run, accessible in downstream expressions as <Code>{'outputs["nodeId"]'}</Code>.
      </p>
      <Callout>
        All workflow execution happens on the backend. Some nodes — HTTP Request, Ping, DataStore,
        AI Completion, Ollama, Send WhatsApp, Transcribe Audio — require the backend by design (network
        access, secrets, database). A run review under Jobs streams live results from the server via SSE.
      </Callout>

      <h2>Data persistence</h2>
      <p>
        Workflows, scripts, and triggers are persisted to a SQLite database through the Fastify backend.
        Settings (theme, editor font size) are stored in <Code>localStorage</Code> and are browser-local.
      </p>
    </div>
  );
}

function PageGettingStarted() {
  return (
    <div className="docs-page">
      <h1>Getting Started</h1>
      <p className="docs-page-subtitle">
        Build and run your first workflow in five steps.
      </p>

      <div className="docs-step">
        <div className="docs-step-num">1</div>
        <div className="docs-step-content">
          <h3>Create a workflow</h3>
          <p>
            From the home screen, open <strong>Workflows</strong>. Click <strong>New Workflow</strong>, give it a name,
            and press Create. The canvas opens automatically.
          </p>
        </div>
      </div>

      <div className="docs-step">
        <div className="docs-step-num">2</div>
        <div className="docs-step-content">
          <h3>Add nodes</h3>
          <p>
            Drag any node from the left palette onto the canvas, or double-click a blank area to open the
            node picker. Each node type has an icon and a category label. Nodes snap to a 16 px grid.
          </p>
        </div>
      </div>

      <div className="docs-step">
        <div className="docs-step-num">3</div>
        <div className="docs-step-content">
          <h3>Connect nodes</h3>
          <p>
            Hover over a node to reveal its handles (small circles). Drag from an output handle to an
            input handle on another node to create an edge. Fork, Loop, and Switch nodes have multiple
            output handles for each branch.
          </p>
        </div>
      </div>

      <div className="docs-step">
        <div className="docs-step-num">4</div>
        <div className="docs-step-content">
          <h3>Configure nodes</h3>
          <p>
            Click any node to open the <strong>Config panel</strong> on the right. Fill in the fields — most
            fields support expression interpolation: type <Code>{'{{outputs["nodeId"].field}}'}</Code> to
            reference upstream data.
          </p>
        </div>
      </div>

      <div className="docs-step">
        <div className="docs-step-num">5</div>
        <div className="docs-step-content">
          <h3>Run and inspect</h3>
          <p>
            Press <strong>▶ Run</strong> in the toolbar. The app switches to the <strong>Jobs</strong> space
            where the run appears; open it to review on the canvas, with node status badges updating in real
            time (idle → running → success/error). Click any executed node to inspect its input and output
            in the Config panel.
          </p>
        </div>
      </div>

      <hr className="docs-divider" />

      <h2>Your first useful workflow</h2>
      <p>Try this pattern to fetch data from a public API and log the result:</p>
      <ol>
        <li>Add an <strong>HTTP Request</strong> node. Set URL to <Code>https://httpbin.org/get</Code>, method GET.</li>
        <li>Add a <strong>Log</strong> node and connect the HTTP node to it.</li>
        <li>Set the Log message to <Code>{'{{outputs["httpNode"].data.url}}'}</Code>.</li>
        <li>Press Run and watch the log tab populate.</li>
      </ol>

      <h2>Saving and version control</h2>
      <p>
        Press <Kbd>Ctrl+S</Kbd> (or the Save button in the toolbar) to persist changes to the database.
        The toolbar shows an unsaved indicator (•) when there are uncommitted edits. Use
        <Kbd>Ctrl+Z</Kbd> / <Kbd>Ctrl+R</Kbd> for local undo/redo within a session.
      </p>

      <Callout warn>
        <strong>Unsaved changes are not auto-saved.</strong> If you navigate away with unsaved edits, a
        Save / Discard / Cancel dialog will appear.
      </Callout>

      <h2>Import and export</h2>
      <p>
        In the Workflows manager (before opening a workflow), use the <strong>Import</strong> button to load
        a workflow JSON file. Any open workflow can be exported via the ··· menu in the toolbar.
        Exported files include all nodes, edges, and metadata but not run history.
      </p>
    </div>
  );
}

function PageConceptWorkflows() {
  return (
    <div className="docs-page">
      <h1>Workflows</h1>
      <p className="docs-page-subtitle">
        A workflow is a versioned, named directed graph that describes an automated process.
      </p>

      <h2>Structure</h2>
      <p>Every workflow contains:</p>
      <ul>
        <li><strong>Nodes</strong> — typed building blocks, each with a unique ID, a position on the canvas, and a config object.</li>
        <li><strong>Edges</strong> — directed connections from one node's output handle to another node's input handle.</li>
        <li><strong>Variables</strong> — a key/value store initialised before the run starts.</li>
        <li><strong>Layout direction</strong> — top-to-bottom (TB) or left-to-right (LR); affects auto-layout.</li>
      </ul>

      <h2>Workflow lifecycle</h2>
      <Pre>{`create → edit (add nodes, edges, config) → save → run → inspect results`}</Pre>

      <h2>Entrypoint nodes</h2>
      <p>
        Any node with no incoming edges is treated as an entrypoint. A workflow can have multiple
        entrypoints; they all fire simultaneously at run start.
      </p>

      <h2>Versioning</h2>
      <p>
        Each workflow carries an integer version that increments on every save. The version is visible
        in the workflow's metadata and in exported JSON files.
      </p>

      <h2>Variables initialisation</h2>
      <p>
        Workflow variables defined in the workflow's metadata are accessible to all nodes as
        <Code>variables.name</Code>. Use Set Variable nodes to create or update variables during execution.
      </p>

      <h2>Auto-layout</h2>
      <p>
        The <strong>Auto Layout</strong> button in the toolbar rearranges all nodes using a hierarchical
        algorithm (Sugiyama). This is non-destructive and can be undone with <Kbd>Ctrl+Z</Kbd>. Toggle
        between TB and LR layout directions in the toolbar.
      </p>

      <h2>Error handler</h2>
      <p>
        Every workflow can designate another workflow as its <strong>error handler</strong>.
        Open the settings cog (⚙) on the canvas toolbar → <em>On error…</em> and select the target
        workflow. When any node in the main workflow fails, the engine fires the error handler workflow
        asynchronously in the background — the failed run still records as errored, and the handler run
        appears in the Jobs view as a separate entry. Use it to send an alert, write to a log table, or
        trigger a recovery procedure.
      </p>
      <Callout warn>
        <strong>Avoid error-handler cycles.</strong> A workflow cannot designate itself as its own error
        handler. If the error-handler workflow itself fails, no further escalation occurs.
      </Callout>

      <h2>Cloning and importing</h2>
      <p>
        Clone a workflow from the manager to create an independent copy with a new ID. Import accepts
        workflow JSON files (produced by export), assigning a new ID on import so the original is preserved.
      </p>

      <h2>Deleting and deprecation</h2>
      <p>
        Deleting a workflow with <strong>no run history</strong> removes it permanently. Deleting one that{' '}
        <strong>has runs</strong> instead <strong>deprecates</strong> it — a soft delete that keeps the workflow
        and its runs so past runs stay reviewable (a hard delete would cascade the run history away).
      </p>
      <p>
        A deprecated workflow is read-only history: the manager shows it with a <strong>Deprecated</strong> badge,
        it cannot be run or edited (nor targeted by triggers, Run Workflow nodes, or error handlers), and its runs
        can still be opened for review. Use <strong>Clone</strong> for a fresh editable copy, or{' '}
        <strong>Delete permanently</strong> to remove it and its runs. If retention later prunes all of a
        deprecated workflow's runs, the empty workflow is removed automatically.
      </p>
    </div>
  );
}

function PageConceptNodes() {
  return (
    <div className="docs-page">
      <h1>Nodes & Edges</h1>
      <p className="docs-page-subtitle">
        Nodes are the fundamental units of work; edges are the data channels between them.
      </p>

      <h2>Node anatomy</h2>
      <table className="docs-table">
        <thead><tr><th>Property</th><th>Description</th></tr></thead>
        <tbody>
          <tr><td>type</td><td>Determines which registered node definition handles this node.</td></tr>
          <tr><td>id</td><td>Auto-generated UUID unique within the workflow.</td></tr>
          <tr><td>name</td><td>Optional human-readable label shown on the canvas (overrides the type label).</td></tr>
          <tr><td>description</td><td>Optional freetext description visible in the Config panel.</td></tr>
          <tr><td>config</td><td>Type-specific configuration object (validated with Zod on run).</td></tr>
          <tr><td>position</td><td>x/y canvas coordinates; snapped to the 16 px grid.</td></tr>
        </tbody>
      </table>

      <h2>Node categories</h2>
      <ul>
        <li><strong>Logic</strong> — Condition, Fork, Switch, Script, Loop: control flow and computation.</li>
        <li><strong>Control</strong> — Run Workflow, Delay, Set Variable, Log, Label, Junction: execution control and annotation.</li>
        <li><strong>Data</strong> — Transform, Filter, Sort, Aggregate, Render Template, Math, Datetime: data manipulation.</li>
        <li><strong>Data Store</strong> — DataStore Query, DataStore Upsert: read from and write to persistent tables.</li>
        <li><strong>File</strong> — Parse CSV, Format CSV, Read File, Write File: file I/O.</li>
        <li><strong>Integration</strong> — HTTP Request, GraphQL, Ping: external system communication.</li>
        <li><strong>Notification</strong> — Send Email, Send Slack, Send Teams, Send WhatsApp: outbound alerts.</li>
        <li><strong>AI</strong> — AI Completion, Ollama Completion, Ollama Vision, Transcribe Audio: language models and speech.</li>
      </ul>

      <h2>Handles</h2>
      <p>
        Most nodes have one input handle (top or left) and one output handle (bottom or right).
        Branch nodes expose multiple output handles:
      </p>
      <ul>
        <li><strong>Fork / Condition</strong> — <Code>true</Code> and <Code>false</Code> handles.</li>
        <li><strong>Switch</strong> — one handle per named case plus <Code>default</Code>.</li>
        <li><strong>Loop</strong> — <Code>loop</Code> (body, repeats) and main output (exits).</li>
      </ul>

      <h2>Edges</h2>
      <p>
        An edge carries the full output object of the source node. Edges from Fork/Switch handles are
        labelled on the canvas with the condition text. Edges from Loop's body handle are rendered with
        a dashed stroke to indicate the repeating path.
      </p>
      <Callout>
        An edge's <em>condition</em> property is an optional expression evaluated at runtime. If the expression
        is falsy the edge is not followed. Leave it empty for unconditional flow.
      </Callout>

      <h2>Execution order</h2>
      <p>
        Nodes execute in topological order. When a node has multiple incoming edges, it waits until all
        predecessor nodes in the current branch have completed before executing. Nodes in independent
        branches may execute concurrently.
      </p>

      <h2>Node status</h2>
      <table className="docs-table">
        <thead><tr><th>Status</th><th>Badge colour</th><th>Meaning</th></tr></thead>
        <tbody>
          <tr><td>idle</td><td>—</td><td>Not yet executed this run.</td></tr>
          <tr><td>running</td><td>Blue pulse</td><td>Currently executing.</td></tr>
          <tr><td>success</td><td>Green</td><td>Completed without error.</td></tr>
          <tr><td>error</td><td>Red</td><td>Threw an exception; run continues on other branches.</td></tr>
          <tr><td>cancelled</td><td>Grey</td><td>Run was cancelled before this node executed.</td></tr>
        </tbody>
      </table>

      <h2>Copying and pasting</h2>
      <p>
        Select one or more nodes and press <Kbd>Ctrl+C</Kbd> to copy (or <Kbd>Ctrl+X</Kbd> to cut).
        Press <Kbd>Ctrl+V</Kbd> to paste. Edges between copied nodes are preserved. The clipboard
        persists across workflow switches within the same session.
      </p>
    </div>
  );
}

function PageConceptVariables() {
  return (
    <div className="docs-page">
      <h1>Variables & Expressions</h1>
      <p className="docs-page-subtitle">
        Variables store state across a run; expressions read from nodes and variables inline.
      </p>

      <h2>Workflow variables</h2>
      <p>
        Variables are a flat key/value store scoped to a single workflow run. Any node can read any
        variable; only Set Variable nodes can write to them. Initial values come from the workflow's metadata.
      </p>
      <Pre>{`// Read a variable in an expression field
variables.myVar

// Write a variable with the Set Variable node
name:  "myVar"
value: outputs["computeNode"].result`}</Pre>

      <h2>Accessing node outputs</h2>
      <p>
        Every executed node's output is stored in the <Code>outputs</Code> map, keyed by node ID.
        The node ID is the UUID shown at the bottom of each node in the Config panel.
      </p>
      <Pre>{`outputs["a1b2c3d4"]          // full output object of a node
outputs["a1b2c3d4"].body     // nested field access
outputs["a1b2c3d4"].items[0] // array element`}</Pre>

      <h2>Expression syntax</h2>
      <p>
        Most config fields that accept an expression evaluate the raw string as JavaScript. A few
        fields use template interpolation — these are marked with the <Code>{'{{}}'}</Code> syntax.
      </p>

      <table className="docs-table">
        <thead><tr><th>Context</th><th>Syntax</th><th>Example</th></tr></thead>
        <tbody>
          <tr>
            <td>Condition / Filter predicate</td>
            <td>JS expression</td>
            <td><Code>{'outputs["n1"].count > 0'}</Code></td>
          </tr>
          <tr>
            <td>Render Template body</td>
            <td><Code>{'{{}}'}</Code> interpolation</td>
            <td><Code>{'Hello {{variables.name}}!'}</Code></td>
          </tr>
          <tr>
            <td>Transform / Math body</td>
            <td>JS function body (use return)</td>
            <td><Code>{'return outputs["n1"].items.length * 2'}</Code></td>
          </tr>
          <tr>
            <td>URL fields</td>
            <td><Code>{'{{}}'}</Code> interpolation</td>
            <td><Code>{'https://api.example.com/{{variables.id}}'}</Code></td>
          </tr>
        </tbody>
      </table>

      <h2>Available context in expressions</h2>
      <ul>
        <li><Code>outputs</Code> — map of all upstream node results (<Code>{'Record<nodeId, output>'}</Code>).</li>
        <li><Code>variables</Code> — current variable store (<Code>{'Record<string, unknown>'}</Code>).</li>
        <li><Code>log(msg)</Code> — write to the execution log (available in Script and Transform).</li>
      </ul>

      <Callout warn>
        <strong>Execution order matters.</strong> An expression can only reference outputs of nodes that
        have already executed. Referencing a node that hasn't run yet yields <Code>undefined</Code>.
      </Callout>

      <h2>Type coercion</h2>
      <p>
        Expression results are not automatically coerced — if a Condition expects a boolean and the
        expression returns a truthy string, it will be treated as <Code>true</Code>. Be explicit:
        <Code>{'outputs["n"].status === "ok"'}</Code> rather than <Code>{'outputs["n"].status'}</Code>.
      </p>
    </div>
  );
}

function PageConceptScripts() {
  return (
    <div className="docs-page">
      <h1>Scripts</h1>
      <p className="docs-page-subtitle">
        Reusable JavaScript functions that can be invoked from any Script node in any workflow.
      </p>

      <h2>What is a script?</h2>
      <p>
        A script is a named JavaScript function stored separately from any workflow. Scripts are useful
        when you need the same logic in multiple workflows, or when the logic is too complex for an
        inline Transform node. The Scripts space provides a full Monaco code editor with autocompletion.
      </p>

      <h2>Script structure</h2>
      <Pre>{`// Scripts receive two arguments:
// - input: object resolved from the node's input bindings
// - context: { outputs, variables, log }

const { items } = input;
const filtered = items.filter(item => item.active);
return { items: filtered, count: filtered.length };`}</Pre>

      <Callout>
        Scripts must use synchronous code. <Code>async/await</Code> is not supported — use Transform nodes
        with Promises if you need asynchronous logic.
      </Callout>

      <h2>Input bindings</h2>
      <p>
        When you use a Script node on the canvas, the Config panel shows an <strong>Input Bindings</strong> section.
        Each input declared by the script can be bound to:
      </p>
      <ul>
        <li><strong>Node output</strong> — the full output of any upstream node.</li>
        <li><strong>Primitive value</strong> — a hardcoded string, number, or boolean.</li>
        <li><strong>Variable</strong> — the current value of a named workflow variable.</li>
      </ul>

      <h2>Timeout</h2>
      <p>
        Each script has a configurable timeout in seconds (default 300). If the script does not return
        within that time, it is terminated and the Script node fails with a timeout error.
      </p>

      <h2>Defining script inputs</h2>
      <p>
        In the Scripts editor, declare expected inputs by name. The engine uses this declaration to
        render the Input Bindings UI in the Script node's config panel. Undeclared inputs default to the
        full variables store.
      </p>

      <h2>Sharing scripts</h2>
      <p>
        Scripts are global — they are not scoped to a specific workflow. A script renamed in the Scripts
        space must also be updated in any Script node that references it by name.
      </p>
    </div>
  );
}

function PageConceptTriggers() {
  return (
    <div className="docs-page">
      <h1>Triggers</h1>
      <p className="docs-page-subtitle">
        Automate workflow execution via cron schedules or incoming HTTP webhooks.
      </p>

      <h2>Trigger types</h2>
      <table className="docs-table">
        <thead><tr><th>Type</th><th>How it fires</th></tr></thead>
        <tbody>
          <tr>
            <td><strong>Schedule</strong></td>
            <td>A cron expression evaluated by the backend on the configured timezone.</td>
          </tr>
          <tr>
            <td><strong>Webhook</strong></td>
            <td>An HTTP POST to <Code>/webhooks/:path</Code> with an optional HMAC secret for verification.</td>
          </tr>
        </tbody>
      </table>

      <h2>Creating a trigger</h2>
      <ol>
        <li>Open the <strong>Triggers</strong> space from the home screen.</li>
        <li>Click <strong>New Trigger</strong> and select the type (Schedule or Webhook).</li>
        <li>Configure the target workflow, the cron expression or webhook path, and optionally a secret.</li>
        <li>Enable the trigger. It will fire as soon as the conditions are met.</li>
      </ol>

      <h2>Cron syntax</h2>
      <Pre>{`┌──── second (0-59, optional)
│ ┌── minute (0-59)
│ │ ┌─ hour (0-23)
│ │ │ ┌─ day-of-month (1-31)
│ │ │ │ ┌─ month (1-12)
│ │ │ │ │ ┌─ day-of-week (0-7, 0=Sunday)
│ │ │ │ │ │
* * * * * *

Examples:
0 9 * * 1-5   — 9:00 AM every weekday
*/15 * * * *  — every 15 minutes
0 0 1 * *     — midnight on the 1st of every month`}</Pre>

      <h2>Webhook security</h2>
      <p>
        When a secret is configured, the backend verifies an <Code>X-Webhook-Signature</Code> header
        (<Code>sha256=&lt;hex&gt;</Code>, HMAC-SHA256 of the raw request body; the GitHub-style{' '}
        <Code>X-Hub-Signature-256</Code> header is also accepted) before accepting the trigger. Leave
        secret empty to accept all POST requests.
      </p>

      <Callout warn>
        <strong>Keep webhook secrets private.</strong> Anyone with the URL and no secret can trigger your
        workflow. Always set a secret in production environments.
      </Callout>

      <h2>Webhook payload</h2>
      <p>
        The JSON body of the webhook POST is merged into the workflow's variable store under the
        key <Code>trigger</Code> for the duration of that run. Reference individual fields
        with <Code>{'{{trigger.myField}}'}</Code> or <Code>variables.trigger.myField</Code> in expressions.
      </p>

      <h2>Enabling and disabling</h2>
      <p>
        Each trigger has an enabled/disabled toggle. Disabled triggers do not fire regardless of schedule
        or incoming requests. Use this to pause automation without deleting the trigger configuration.
      </p>
    </div>
  );
}

function PageConceptRunPanel() {
  return (
    <div className="docs-page">
      <h1>Running Workflows</h1>
      <p className="docs-page-subtitle">
        The canvas editor is for building; running a workflow hands off to the Jobs space to watch it.
      </p>

      <h2>Starting a run</h2>
      <p>
        Press <strong>▶ Run</strong> in the canvas editor toolbar. The workflow is submitted to the backend
        queue and the app switches to the <strong>Jobs</strong> space, filtered to this workflow, where the
        new run appears and updates as it progresses.
      </p>
      <Callout>
        <strong>Running saves first.</strong> The backend executes the last saved version of the workflow,
        so pressing Run automatically saves any unsaved canvas edits before starting. If the save can't reach
        the backend, the run is not started and the error is shown next to the Run button.
      </Callout>

      <h2>Watching a run</h2>
      <p>
        All execution happens on the backend. The editor itself no longer streams progress — observation
        lives under <strong>Jobs</strong>:
      </p>
      <ul>
        <li>The Jobs list shows each run's status, timing, and trigger, and refreshes while runs are active.</li>
        <li>Open a run to review it read-only on the canvas (see <em>Reviewing a run on the canvas</em> under
          Jobs). While a run is still live, its node badges and log stream in real time via Server-Sent
          Events; a finished run replays its recorded results. The palette is replaced by the run's Nodes and
          Log tabs and the canvas is locked.</li>
        <li>Click any completed node to view its input/output in the Config panel; click a failed node
          (red badge) to read its error.</li>
      </ul>

      <h2>Node timing display</h2>
      <p>Enable <strong>Show node timing</strong> in Settings → Canvas. In a run review:</p>
      <ul>
        <li><strong>Running</strong> — the badge counts up live from the node's start time.</li>
        <li><strong>Completed / Failed</strong> — shows total wall-clock duration.</li>
        <li>Times are formatted as <Code>&lt;1s</Code>, <Code>5s</Code>, or <Code>2m 14s</Code>.</li>
      </ul>

      <h2>Cancelling a run</h2>
      <p>
        Cancel an active run from the run review (or the Jobs list). Cancellation sends a signal to the backend:
      </p>
      <ul>
        <li>The node currently executing is allowed to finish naturally.</li>
        <li>All pending nodes are skipped and their status is set to <Code>cancelled</Code>.</li>
        <li>The run record is finalised with status <Code>cancelled</Code>.</li>
      </ul>
      <p>Cancellation is also available via the REST API: <Code>DELETE /runs/:id</Code>.</p>

      <h2>Run history</h2>
      <p>
        Every run is stored in the database and browsable in the <strong>Jobs</strong> space, with filtering
        by workflow, status, trigger, and time range. Each run record includes:
      </p>
      <ul>
        <li>Status (queued / running / success / error / cancelled)</li>
        <li>Start and finish timestamps</li>
        <li>Per-node results (input, output, error, timing)</li>
        <li>Full execution log</li>
      </ul>

      <h2>Debugging tips</h2>
      <ul>
        <li>Insert <strong>Log</strong> nodes at key points to trace data values mid-execution.</li>
        <li>Open a run under Jobs and click a failed node (red badge) to read the error in the Config panel.</li>
        <li>Compare results across runs in the Jobs list after changing a node's config.</li>
      </ul>
    </div>
  );
}

function PageWhatsAppBridge() {
  return (
    <div className="docs-page">
      <h1>WhatsApp Bridge</h1>
      <p className="docs-page-subtitle">
        Trigger workflows from WhatsApp messages using slash commands such as <Code>/voicelog</Code> or <Code>/receipt</Code>.
      </p>

      <h2>Architecture</h2>
      <p>
        The <strong>whatsapp-bridge</strong> service connects to WhatsApp Web via Baileys and runs alongside
        the workflow engine in Docker Compose. When a message arrives that starts with <Code>/</Code>, the bridge
        extracts the command and POSTs to the engine's webhook endpoint:
      </p>
      <Pre>{`WhatsApp message "/voicelog great meeting today"
  → whatsapp-bridge
  → POST /webhooks/voicelog  { sender, pn, content, command, args, media, ... }
  → fires the workflow linked to the "voicelog" webhook trigger
  → Send WhatsApp node replies to trigger.sender`}</Pre>

      <h2>Setup</h2>

      <div className="docs-step">
        <div className="docs-step-num">1</div>
        <div className="docs-step-content">
          <h3>Start the stack</h3>
          <p>
            Run <Code>docker compose up</Code>. Both <Code>app</Code> and <Code>whatsapp-bridge</Code> start.
            Watch the bridge logs — it prints a QR code to the terminal on first run.
          </p>
        </div>
      </div>

      <div className="docs-step">
        <div className="docs-step-num">2</div>
        <div className="docs-step-content">
          <h3>Pair your phone</h3>
          <p>
            Open WhatsApp → Settings → Linked Devices → Link a Device and scan the QR code from the bridge logs.
            The bridge logs <Code>Connected to WhatsApp</Code> when pairing succeeds. Credentials are saved in the
            <Code>wa_auth</Code> Docker volume — you only need to scan once.
          </p>
        </div>
      </div>

      <div className="docs-step">
        <div className="docs-step-num">3</div>
        <div className="docs-step-content">
          <h3>Create a webhook trigger</h3>
          <p>
            In the Triggers space, create a <strong>Webhook</strong> trigger. Set the path to the command name
            without the slash — e.g. <Code>voicelog</Code> for the <Code>/voicelog</Code> command. Link it to a
            workflow and enable it.
          </p>
          <Callout>
            The path is matched case-insensitively. A message of <Code>/Voicelog hello</Code> fires the trigger
            at path <Code>voicelog</Code>.
          </Callout>
        </div>
      </div>

      <div className="docs-step">
        <div className="docs-step-num">4</div>
        <div className="docs-step-content">
          <h3>Build the workflow</h3>
          <p>
            Use the trigger variables listed below to access the message data. Add a <strong>Send WhatsApp</strong> node
            at the end with <Code>to</Code> set to <Code>{'{{trigger.sender}}'}</Code> to reply to the sender.
          </p>
        </div>
      </div>

      <div className="docs-step">
        <div className="docs-step-num">5</div>
        <div className="docs-step-content">
          <h3>Send a test command</h3>
          <p>
            Message yourself on WhatsApp: <Code>/voicelog great meeting today</Code>. The workflow fires and the
            reply arrives in the same chat.
          </p>
        </div>
      </div>

      <h2>Trigger variables</h2>
      <p>
        Every run started by a WhatsApp command receives these fields under the <Code>trigger</Code> key,
        accessible as <Code>{'{{trigger.field}}'}</Code> or <Code>variables.trigger.field</Code>:
      </p>
      <table className="docs-table">
        <thead>
          <tr><th>Variable</th><th>Type</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><Code>trigger.sender</Code></td><td>string</td><td>Full WhatsApp JID — pass to <strong>Send WhatsApp</strong> to reply.</td></tr>
          <tr><td><Code>trigger.pn</Code></td><td>string</td><td>Phone number only, without the <Code>@s.whatsapp.net</Code> suffix.</td></tr>
          <tr><td><Code>trigger.content</Code></td><td>string</td><td>Full message text including the command: <Code>/voicelog great meeting today</Code>.</td></tr>
          <tr><td><Code>trigger.command</Code></td><td>string</td><td>Command name without the slash: <Code>voicelog</Code>.</td></tr>
          <tr><td><Code>trigger.args</Code></td><td>string</td><td>Everything after the command name: <Code>great meeting today</Code>.</td></tr>
          <tr><td><Code>trigger.media</Code></td><td>string[]</td><td>Paths to downloaded media attachments inside the <Code>wa_media</Code> volume.</td></tr>
          <tr><td><Code>trigger.isAudio</Code></td><td>boolean</td><td><Code>true</Code> when the message contains a voice note.</td></tr>
          <tr><td><Code>trigger.timestamp</Code></td><td>number</td><td>Unix timestamp (seconds) of the original message.</td></tr>
        </tbody>
      </table>

      <Callout>
        Media files are written to the <Code>wa_media</Code> Docker volume, which is shared between the bridge
        and the engine containers. Reference them with <Code>{'{{trigger.media[0]}}'}</Code> in HTTP or Read File nodes.
      </Callout>

      <h2>Security</h2>
      <ul>
        <li>
          <strong>ALLOW_FROM</strong> — comma-separated phone numbers permitted to trigger workflows.
          Messages from all other senders are silently ignored. Leave unset to allow any sender.
        </li>
        <li>
          <strong>WEBHOOK_SECRET</strong> — if set, the bridge signs every forwarded request with an
          HMAC-SHA256 header. Set the same secret in the webhook trigger so the engine can verify it.
        </li>
      </ul>

      <h2>Environment variables</h2>
      <table className="docs-table">
        <thead>
          <tr><th>Variable</th><th>Default</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><Code>AUTH_DIR</Code></td><td><Code>/app/auth</Code></td><td>Where Baileys stores WhatsApp session credentials.</td></tr>
          <tr><td><Code>SEND_PORT</Code></td><td><Code>3002</Code></td><td>Port the bridge send API listens on (used by Send WhatsApp node).</td></tr>
          <tr><td><Code>WORKFLOW_ENGINE_URL</Code></td><td><Code>http://app:3001</Code></td><td>Base URL of the workflow engine backend.</td></tr>
          <tr><td><Code>WEBHOOK_SECRET</Code></td><td>—</td><td>Shared HMAC secret. Must match the webhook trigger config if used.</td></tr>
          <tr><td><Code>ALLOW_FROM</Code></td><td>—</td><td>Comma-separated phone number whitelist. Unset = allow all.</td></tr>
          <tr><td><Code>WHATSAPP_BRIDGE_URL</Code></td><td><Code>http://whatsapp-bridge:3002</Code></td><td>Set in the <Code>app</Code> service so the Send WhatsApp node can reach the bridge.</td></tr>
        </tbody>
      </table>

      <h2>Re-pairing the device</h2>
      <p>
        To link a different phone or recover from an expired session, delete the auth volume and restart:
      </p>
      <Pre>{`docker compose down
docker volume rm workflow_wa_auth
docker compose up whatsapp-bridge`}</Pre>
    </div>
  );
}

function PagePlugins() {
  return (
    <div className="docs-page">
      <h1>Plugin Modules</h1>
      <p className="docs-page-subtitle">
        A convention for adding custom nodes and sidecar services as self-contained drop-in modules.
      </p>

      <h2>Why plugins?</h2>
      <p>
        Built-in nodes cover generic operations — HTTP, transforms, notifications. A plugin bundles a
        purpose-built node together with the service it talks to, so both the logic and the infrastructure
        travel as one unit. The WhatsApp bridge is the original example; Voice to Text is the first plugin
        following the formalised convention.
      </p>

      <h2>Directory layout</h2>
      <Pre>{`backend/src/plugins/
  index.ts                  ← barrel: imports plugins, exports getPluginServices()
  types.ts                  ← shared PluginManifest type
  <name>/
    index.ts                ← registers backend node(s), exports manifest
    <node>Node.ts           ← execute logic

frontend/src/plugins/
  <name>/
    index.ts                ← registers frontend node(s) (UI metadata)
    <node>Node.ts           ← label, schema, defaultConfig, fieldMeta

plugins/
  <name>/
    compose.snippet.yml     ← copy-paste guide for adding the service to docker-compose.yml`}</Pre>

      <Callout>
        Backend plugins live under <Code>backend/src/</Code> so they are compiled by the existing TypeScript
        build without any Dockerfile changes. Frontend plugins live under <Code>frontend/src/</Code>
        so Vite bundles them automatically.
      </Callout>

      <h2>The plugin manifest</h2>
      <p>
        Each backend plugin's <Code>index.ts</Code> exports a <Code>manifest</Code> object that describes
        the sidecar service it depends on:
      </p>
      <Pre>{`import type { PluginManifest } from '../types';

export const manifest: PluginManifest = {
  service: {
    displayName: 'Voice to Text',   // shown on the home page status chip
    envVar:      'VOICE_TO_TEXT_URL', // env var that overrides the URL at runtime
    defaultUrl:  'http://voice-to-text:9000', // Docker Compose service name + port
    healthPath:  '/health',         // GET this path to determine online/offline status
  },
};`}</Pre>
      <p>
        The <Code>getPluginServices()</Code> function in <Code>backend/src/plugins/index.ts</Code> reads
        all manifests and feeds the result into the service health registry. This means every plugin's
        service appears automatically on the home page status bar — no manual <Code>REGISTERED_SERVICES</Code>
        entry required.
      </p>

      <h2>How nodes are registered</h2>
      <p>
        Node registration works the same way as built-in nodes — a call to <Code>registerNode()</Code> as
        a module side-effect. The plugin loaders trigger those side-effects in two places:
      </p>
      <table className="docs-table">
        <thead><tr><th>Layer</th><th>Loader</th><th>Mechanism</th></tr></thead>
        <tbody>
          <tr>
            <td>Backend (main process)</td>
            <td><Code>backend/src/services.ts</Code></td>
            <td>Imports <Code>plugins/index.ts</Code> at module load time to collect service configs, which triggers node registration as a side-effect.</td>
          </tr>
          <tr>
            <td>Backend (worker threads)</td>
            <td><Code>backend/src/runner/worker.ts</Code></td>
            <td>Explicitly imports <Code>../plugins/index</Code> alongside the built-in nodes barrel. Each worker thread runs this independently.</td>
          </tr>
          <tr>
            <td>Frontend</td>
            <td><Code>frontend/src/App.tsx</Code></td>
            <td>Uses <Code>import.meta.glob('./plugins/*/index.ts', &#123; eager: true &#125;)</Code>. Vite resolves the glob at build time — adding a plugin folder is enough.</td>
          </tr>
        </tbody>
      </table>

      <h2>Adding a new plugin — step by step</h2>

      <div className="docs-step">
        <div className="docs-step-num">1</div>
        <div className="docs-step-content">
          <h3>Create the backend node</h3>
          <p>Add <Code>{'backend/src/plugins/<name>/<node>Node.ts'}</Code>. Call <Code>registerNode()</Code> at the bottom with <Code>type</Code>, <Code>label</Code>, and <Code>execute</Code>.</p>
          <Pre>{`import { z } from 'zod';
import { registerNode } from '../../engine/nodeRegistry';
import { resolveString } from '../../engine/expression';

const schema = z.object({ inputField: z.string() });

const execute = async (node, context) => {
  const startedAt = Date.now();
  const config = schema.parse(node.config);
  try {
    const value = resolveString(config.inputField, context);
    const serviceUrl = process.env.MY_SERVICE_URL ?? 'http://my-service:8080';
    const resp = await fetch(\`\${serviceUrl}/endpoint\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    });
    if (!resp.ok) throw new Error(\`Service error: \${resp.status}\`);
    const data = await resp.json();
    return { nodeId: node.id, status: 'success', output: data, startedAt, finishedAt: Date.now() };
  } catch (err) {
    return { nodeId: node.id, status: 'error', output: null,
      error: err instanceof Error ? err.message : String(err), startedAt, finishedAt: Date.now() };
  }
};

registerNode({ type: 'my-node', label: 'My Node', execute });`}</Pre>
        </div>
      </div>

      <div className="docs-step">
        <div className="docs-step-num">2</div>
        <div className="docs-step-content">
          <h3>Create the backend plugin index</h3>
          <p>Add <Code>backend/src/plugins/{'<name>'}/index.ts</Code> that imports the node file and exports the manifest.</p>
          <Pre>{`import './myNode';
import type { PluginManifest } from '../types';

export const manifest: PluginManifest = {
  service: {
    displayName: 'My Service',
    envVar:      'MY_SERVICE_URL',
    defaultUrl:  'http://my-service:8080',
    healthPath:  '/health',
  },
};`}</Pre>
        </div>
      </div>

      <div className="docs-step">
        <div className="docs-step-num">3</div>
        <div className="docs-step-content">
          <h3>Register it in the plugin barrel</h3>
          <p>Open <Code>backend/src/plugins/index.ts</Code> and add two lines:</p>
          <Pre>{`import './my-plugin';
import { manifest as myPluginManifest } from './my-plugin';

// ...existing imports...

const manifests: PluginManifest[] = [
  voiceToTextManifest,
  myPluginManifest,  // ← add this
];`}</Pre>
        </div>
      </div>

      <div className="docs-step">
        <div className="docs-step-num">4</div>
        <div className="docs-step-content">
          <h3>Create the frontend node</h3>
          <p>Add <Code>frontend/src/plugins/{'<name>'}/index.ts</Code> that imports a node file with the full UI definition (label, description, category, configSchema, defaultConfig, fieldMeta).</p>
          <Pre>{`// frontend/src/plugins/my-plugin/myNode.ts
import { z } from 'zod';
import { registerNode } from '../../engine/nodeRegistry';

registerNode({
  type:        'my-node',
  label:       'My Node',
  description: 'Calls My Service and returns the result.',
  category:    'Integration',
  configSchema: z.object({ inputField: z.string().min(1) }),
  defaultConfig: { inputField: '' },
  execute: () => { throw new Error('my-node executes on the backend only.'); },
});

// frontend/src/plugins/my-plugin/index.ts
import './myNode';`}</Pre>
          <Callout>
            The frontend glob picks up the new <Code>index.ts</Code> automatically — no import line needed in <Code>App.tsx</Code>.
          </Callout>
        </div>
      </div>

      <div className="docs-step">
        <div className="docs-step-num">5</div>
        <div className="docs-step-content">
          <h3>Add the service to Docker Compose</h3>
          <p>
            Copy the snippet from <Code>plugins/{'<name>'}/compose.snippet.yml</Code> into
            <Code>docker-compose.yml</Code> and set the correct image and port. Add the service URL
            env var to the root <Code>.env</Code> for local dev (pointing at <Code>localhost</Code>
            instead of the Docker hostname), and expose the port in the compose service so the host
            backend can reach it.
          </p>
          <Pre>{`# docker-compose.yml — add to the services: block
my-service:
  image: my-service-image:latest
  ports:
    - "8080:8080"   # expose for local dev
  restart: unless-stopped

# .env — for local dev (npm run dev)
MY_SERVICE_URL=http://localhost:8080`}</Pre>
        </div>
      </div>

      <h2>The Voice to Text plugin</h2>
      <p>
        The <strong>Voice to Text</strong> plugin ships with the engine as the reference implementation.
        It registers the <strong>Transcribe Audio</strong> node (type <Code>transcribe-audio</Code>,
        category AI) and declares the <Code>VOICE_TO_TEXT_URL</Code> service.
      </p>
      <table className="docs-table">
        <thead><tr><th>Variable</th><th>Default</th><th>Description</th></tr></thead>
        <tbody>
          <tr>
            <td><Code>VOICE_TO_TEXT_URL</Code></td>
            <td><Code>http://voice-to-text:9000</Code></td>
            <td>Base URL of the V2T container. Override in <Code>.env</Code> when running the backend on the host.</td>
          </tr>
        </tbody>
      </table>
      <p>
        The node POSTs <Code>{'{ "url": "<audioUrl>", "language": "<optional>" }'}</Code> to
        <Code>{'${VOICE_TO_TEXT_URL}${endpoint}'}</Code> and reads <Code>text</Code> or
        <Code>transcript</Code> from the JSON response. Adjust the <Code>endpoint</Code> field in the
        node config if your container uses a different path.
      </p>

      <Callout warn>
        <strong>Media URLs must be reachable from the backend container.</strong> When a WhatsApp voice note
        triggers a workflow, <Code>trigger.media[0].url</Code> is a URL served by the bridge container. Both
        the backend and the V2T service must be on the same Docker network to fetch it.
      </Callout>

      <h2>A typical voice-note workflow</h2>
      <Pre>{`WhatsApp voice note "/voicelog"
  → Webhook trigger (path: voicelog)
  → Transcribe Audio  audioUrl: {{trigger.media[0].url}}
  → Log               message: {{outputs["transcribe"].text}}
  → Send WhatsApp     to: {{trigger.sender}}
                      text: Transcribed: {{outputs["transcribe"].text}}`}</Pre>
    </div>
  );
}

function PageGuideAI() {
  return (
    <div className="docs-page">
      <h1>AI Completion</h1>
      <p className="docs-page-subtitle">
        Send prompts to OpenAI, Anthropic Claude, or Perplexity from any workflow — no SDK required.
      </p>

      <h2>The AI Completion node</h2>
      <p>
        The <strong>AI Completion</strong> node (category AI, type <Code>ai-completion</Code>) calls a
        cloud LLM provider and returns the generated text. It runs on the backend so API keys never reach
        the browser. All three providers use the Secrets store for credentials — no keys are stored in
        the workflow itself.
      </p>

      <h2>Supported providers</h2>
      <table className="docs-table">
        <thead>
          <tr><th>Provider</th><th>Secret key</th><th>Default model</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>OpenAI</td>
            <td><Code>OPENAI_API_KEY</Code></td>
            <td><Code>gpt-5.4-mini</Code></td>
          </tr>
          <tr>
            <td>Anthropic</td>
            <td><Code>ANTHROPIC_API_KEY</Code></td>
            <td><Code>claude-sonnet-4-6</Code></td>
          </tr>
          <tr>
            <td>Perplexity</td>
            <td><Code>PERPLEXITY_API_KEY</Code></td>
            <td><Code>llama-3.1-sonar-small-128k-online</Code></td>
          </tr>
        </tbody>
      </table>

      <h2>Step 1 — Add your API key</h2>
      <p>
        Open <strong>Settings → Secrets</strong> and add the secret that matches your chosen provider.
        Secrets are stored server-side and are never sent to the browser.
      </p>
      <Callout warn>
        <strong>The node will throw if the secret is missing.</strong> The error message names the exact
        secret key that needs to be set so you know exactly what to add.
      </Callout>

      <h2>Step 2 — Configure the node</h2>
      <table className="docs-table">
        <thead>
          <tr><th>Field</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><Code>provider</Code></td><td>Select openai, anthropic, or perplexity.</td></tr>
          <tr><td><Code>model</Code></td><td>Model ID. Defaults to the provider's recommended model; change to any model your account has access to.</td></tr>
          <tr><td><Code>system</Code></td><td>Optional system instruction (e.g. "You are a concise summariser"). Supports <Code>{'{{}}'}</Code> interpolation.</td></tr>
          <tr><td><Code>prompt</Code></td><td>The user prompt. Supports <Code>{'{{}}'}</Code> interpolation — reference upstream node outputs or variables here.</td></tr>
          <tr><td><Code>temperature</Code></td><td>Sampling temperature 0–2. 0 = deterministic, &gt;1 = more creative. Default 0.7.</td></tr>
          <tr><td><Code>maxTokens</Code></td><td>Maximum tokens to generate. 0 = provider default (Anthropic uses 1024; OpenAI is uncapped).</td></tr>
        </tbody>
      </table>

      <h2>Output shape</h2>
      <Pre>{`{
  text:     string,              // generated text
  model:    string,              // model actually used
  provider: string,              // "openai" | "anthropic" | "perplexity"
  usage: {
    inputTokens:  number,        // prompt tokens consumed
    outputTokens: number         // completion tokens generated
  }
}`}</Pre>

      <h2>Example — summarise an HTTP response</h2>
      <Pre>{`// 1. HTTP Request node  (id: "fetchNode")
GET https://example.com/article

// 2. AI Completion node
provider:    openai
model:       gpt-5.4-mini
system:      You are a concise summariser. Return three bullet points.
prompt:      {{outputs["fetchNode"].body.content}}
temperature: 0.3

// 3. Log node
message: {{outputs["aiNode"].text}}`}</Pre>

      <h2>Using Perplexity for live web search</h2>
      <p>
        Perplexity's <Code>sonar</Code> models can search the web in real time. Use them when the prompt
        requires up-to-date information that was not in the model's training data. The node is wired
        identically to the OpenAI path — just select <Code>perplexity</Code> as the provider.
      </p>

      <Callout>
        All nodes execute on the backend. Press Run in the canvas toolbar to test them, then watch the run under Jobs.
      </Callout>

      <h2>Local LLMs with Ollama</h2>
      <p>
        For on-premise inference with no external API calls, use the <strong>Ollama Completion</strong> node
        instead (type <Code>ollama-completion</Code>). It requires a running Ollama instance and does not
        use the Secrets store — the model runs locally. See the AI node reference for full details.
      </p>
    </div>
  );
}

function PageDataStore() {
  return (
    <div className="docs-page">
      <h1>Data Store</h1>
      <p className="docs-page-subtitle">
        A built-in relational store for persistent, structured data — no external database required.
      </p>

      <h2>What is the Data Store?</h2>
      <p>
        The Data Store lets you create user-defined tables directly inside the workflow engine. Each table
        has named, typed columns and an unlimited number of rows. Tables are backed by SQLite and persist
        across restarts. Use them for logs, queues, configuration, cached API results, or any data that
        multiple workflows need to share.
      </p>

      <h2>Managing tables</h2>
      <p>Open <strong>Data Store</strong> from the home screen. The left panel lists all tables with their row count.</p>
      <ul>
        <li>Click <strong>+ New table</strong> to create a table and give it a name.</li>
        <li>Click the table name to open the editor.</li>
        <li>Use the <strong>Export SQL</strong> button to download the table as a SQL dump.</li>
        <li>Delete a table with the trash icon — this is irreversible.</li>
      </ul>

      <h2>Managing columns</h2>
      <p>Inside the table editor:</p>
      <ul>
        <li>Click <strong>Add column</strong>, enter a name, and choose a type: <Code>text</Code>, <Code>number</Code>, or <Code>boolean</Code>.</li>
        <li>Double-click a column header to rename it inline.</li>
        <li>Click the <strong>🔑 key icon</strong> to mark a column as a key — key columns are used for upsert matching.</li>
        <li>Click the trash icon to delete a column and all its data.</li>
      </ul>

      <h2>Managing rows</h2>
      <ul>
        <li>Click <strong>Add row</strong> to insert an empty row.</li>
        <li>Double-click any cell to edit it inline. Press Enter or click away to commit.</li>
        <li>Delete a row with the trash icon on the right of each row.</li>
      </ul>

      <h2>Copy schema</h2>
      <p>
        The <strong>Copy schema</strong> button copies a JSON sample object to the clipboard that describes the
        column names and their types — e.g. <Code>{'{"name":"text","amount":"number"}'}</Code>. Paste it into the
        <strong>DataStore Upsert</strong> node's data field as a starting point.
      </p>

      <h2>Using Data Store from workflows</h2>
      <p>Two built-in nodes provide workflow access to tables:</p>
      <table className="docs-table">
        <thead><tr><th>Node</th><th>What it does</th></tr></thead>
        <tbody>
          <tr>
            <td><strong>DataStore Query</strong></td>
            <td>Reads rows from a table. Optionally filter by key/value pairs and limit the row count.</td>
          </tr>
          <tr>
            <td><strong>DataStore Upsert</strong></td>
            <td>Inserts or updates a row. If key columns are defined and the data matches an existing row, it updates; otherwise it inserts.</td>
          </tr>
        </tbody>
      </table>

      <Callout>
        DataStore nodes run in the server worker thread. Press Run from the canvas to test them.
      </Callout>

      <h2>Example — append a WhatsApp message to a log table</h2>
      <Pre>{`// Table "messages" with columns: sender (text, key), content (text), timestamp (number)

// Webhook trigger → Set Variable (set ts = {{Date.now()}}) → DataStore Upsert
data: {
  "sender":    "{{trigger.sender}}",
  "content":   "{{trigger.content}}",
  "timestamp": "{{variables.ts}}"
}`}</Pre>
    </div>
  );
}

function PageJobs() {
  return (
    <div className="docs-page">
      <h1>Jobs</h1>
      <p className="docs-page-subtitle">
        A full history of every workflow execution — browse, filter, inspect, and replay runs.
      </p>

      <h2>The Jobs view</h2>
      <p>
        Open <strong>Jobs</strong> from the home screen to see a paginated list of all runs across all
        workflows. Each row shows the workflow name, trigger type, status, start time, and duration.
      </p>

      <h2>Filtering</h2>
      <p>Use the filter controls at the top of the list to narrow results by:</p>
      <ul>
        <li><strong>Workflow</strong> — select a specific workflow from the dropdown.</li>
        <li><strong>Status</strong> — queued, running, success, error, or cancelled.</li>
      </ul>

      <h2>Reviewing a run on the canvas</h2>
      <p>
        <strong>Click any run row</strong> in the Jobs list to open that run at{' '}
        <Code>#/jobs/&lt;runId&gt;</Code> in a dedicated <strong>read-only review mode</strong>: the workflow canvas
        with the run's results overlaid, locked so you cannot accidentally edit a workflow while inspecting a past
        execution. On open, the run's start node is focused automatically. The left column replaces the node palette
        with two tabs — <strong>Nodes</strong> (the per-node execution list; click a node to focus it on the canvas)
        and <strong>Log</strong> (the full execution log). The right column is a read-only inspector for the selected
        node: a <strong>Re-run node</strong> control on top, and the recorded config, resolved config, input, and
        output below. Use the toolbar's <strong>Exit</strong> control to leave review mode, or{' '}
        <strong>← Jobs</strong> to return to the list.
      </p>
      <p>
        Node badges show the recorded status from the historical run, letting you trace exactly which path
        executed and what each node produced. A warning appears if the workflow has been modified (or has unsaved
        edits) since the run, because the canvas may no longer match what actually executed; the node results
        themselves always reflect the run. A node that has since been deleted still appears in the list, marked{' '}
        <em>removed</em>, with its recorded results intact.
      </p>
      <p>
        Use the inspector's <strong>Re-run node</strong> button to re-execute just the selected node against the
        stored run. A dialog shows the node's recorded input as editable JSON — leave it unchanged to re-run with
        the same arguments, or edit it to try different ones. Each re-run is appended as a new iteration you can
        page through.
      </p>

      <h2>Live runs</h2>
      <p>
        Runs with status <Code>running</Code> or <Code>queued</Code> stream live updates via SSE (Server-Sent Events).
        The status badge and per-node results update in real time while the run is in progress.
        A Cancel button appears for live runs and sends a stop signal to the worker thread.
      </p>

      <h2>Run retention</h2>
      <p>
        Run records accumulate indefinitely. Use the <strong>Admin</strong> space to export the full run history
        as part of a backup, or to prune old records during maintenance.
      </p>
    </div>
  );
}

function PageRunWorkflow() {
  return (
    <div className="docs-page">
      <h1>Run Workflow Node</h1>
      <p className="docs-page-subtitle">
        Trigger another workflow from within a workflow — synchronously or asynchronously.
      </p>

      <h2>What it does</h2>
      <p>
        The <strong>Run Workflow</strong> node (category Control, type <Code>run-workflow</Code>) starts another
        workflow programmatically. It is a built-in node — not a plugin — and always executes on the backend.
        Use it to build modular, composable automation: extract a reusable sub-process into its own workflow,
        then call it from multiple parent workflows.
      </p>

      <h2>Sync vs async mode</h2>
      <table className="docs-table">
        <thead><tr><th>Mode</th><th>Behaviour</th><th>Output</th></tr></thead>
        <tbody>
          <tr>
            <td><strong>sync</strong></td>
            <td>Waits for the child workflow to complete before continuing.</td>
            <td>Full child node results map (<Code>{'Record<nodeId, NodeExecutionResult>'}</Code>).</td>
          </tr>
          <tr>
            <td><strong>async</strong></td>
            <td>Fires the child workflow and returns immediately — does not wait.</td>
            <td><Code>{'{ runId: string, mode: "async" }'}</Code></td>
          </tr>
        </tbody>
      </table>

      <h2>Passing variables to the child</h2>
      <p>
        The <strong>Variables</strong> field accepts a JSON object that is merged into the child workflow's
        variable store before it starts. Reference upstream data with expressions:
      </p>
      <Pre>{`{
  "userId":  "{{variables.userId}}",
  "payload": "{{outputs['fetchNode'].body}}"
}`}</Pre>

      <h2>Accessing child results (sync mode)</h2>
      <p>
        In sync mode, the node's output is the child's full results map, keyed by node ID. Reference a
        specific child node's output like this:
      </p>
      <Pre>{`// Run Workflow node has id "runNode"
// Child workflow has a node id "summarise"
outputs["runNode"]["summarise"].output.text`}</Pre>

      <h2>Depth guard</h2>
      <p>
        To prevent infinite recursive calls, the engine tracks nesting depth in a special
        variable <Code>__workflowDepth__</Code>. The maximum depth is <strong>5</strong>. A call that would
        exceed this limit fails with a depth-guard error immediately.
      </p>

      <Callout warn>
        <strong>Sync mode holds a worker thread.</strong> Long-running child workflows in sync mode block
        the parent's worker for the full duration. For fire-and-forget use cases prefer async mode.
      </Callout>
    </div>
  );
}

function PageAdmin() {
  return (
    <div className="docs-page">
      <h1>Admin &amp; Backup</h1>
      <p className="docs-page-subtitle">
        Export a full system backup, restore from a backup file, and monitor system health.
      </p>

      <h2>Accessing Admin</h2>
      <p>
        Open <strong>Admin</strong> from the home screen. The view is divided into sections:
        run statistics, service status, export backup, and import/restore.
      </p>

      <h2>Authentication</h2>
      <p>
        Flowline requires a login. Configure the single account at deploy time with{' '}
        <Code>AUTH_USERNAME</Code> (defaults to <Code>admin</Code>) and a password — either{' '}
        <Code>AUTH_PASSWORD</Code>, or preferably <Code>AUTH_PASSWORD_HASH</Code> from{' '}
        <Code>npm run auth:hash-password</Code>, which keeps the cleartext out of your config. The
        backend refuses to start without a password, so an instance is never reachable
        unauthenticated.
      </p>
      <p>
        Signing in creates a server-side session and sets an <Code>httpOnly</Code> cookie the browser
        sends automatically — nothing is stored in the page and the token never appears in a URL.
        Sessions last <Code>AUTH_SESSION_TTL_HOURS</Code> (default 168 = 7 days) and are revoked on
        logout (under <strong>Settings → Account</strong>). Webhooks (protected by their own HMAC
        secrets), <Code>/health</Code>, the AI capability reference, and served media files stay open
        by design.
      </p>
      <Callout warn>
        <strong>Serve over HTTPS in production.</strong> The session cookie is marked{' '}
        <Code>Secure</Code> when <Code>NODE_ENV=production</Code>; put a TLS-terminating reverse proxy
        in front of the app. Use a strong password — it is the only thing standing between the
        internet and your workflows and decrypted secrets.
      </Callout>

      <h2>Export backup</h2>
      <p>
        Select which datasets to include using the checkboxes. Available datasets:
      </p>
      <table className="docs-table">
        <thead><tr><th>Dataset</th><th>What it includes</th></tr></thead>
        <tbody>
          <tr><td>Workflows</td><td>All workflow definitions (nodes, edges, variables, metadata).</td></tr>
          <tr><td>Scripts</td><td>All saved script functions.</td></tr>
          <tr><td>Triggers</td><td>All schedule and webhook trigger configurations.</td></tr>
          <tr><td>Job runs</td><td>Full run history with per-node results and logs.</td></tr>
          <tr><td>Secrets</td><td>All secrets — stored as plaintext in the backup file.</td></tr>
        </tbody>
      </table>
      <p>
        Click <strong>Select all</strong> to include everything, then <strong>Download backup</strong>.
        The file is named <Code>workflow-backup-YYYY-MM-DD-HH-MM-SS.json</Code> and is downloaded directly
        to your browser.
      </p>
      <Callout warn>
        <strong>Secrets are stored as plaintext in the backup file.</strong> Anyone with the file can read
        all secret values. Store backup files securely and never commit them to version control.
      </Callout>

      <h2>Import / restore</h2>
      <ol>
        <li>Click <strong>Choose backup file…</strong> and select a <Code>.json</Code> backup file.</li>
        <li>The UI parses the file and shows which datasets are available with item counts.</li>
        <li>Select the datasets you want to restore.</li>
        <li>Click <strong>Import selected</strong>.</li>
      </ol>
      <p>Import behaviour per dataset:</p>
      <ul>
        <li><strong>Workflows / Scripts / Triggers</strong> — upsert by ID. Existing records with the same ID are overwritten.</li>
        <li><strong>Job runs</strong> — insert-only (<Code>INSERT OR IGNORE</Code>). Existing run records are never modified.</li>
        <li><strong>Secrets</strong> — overwrite by name. Existing secrets with the same name are replaced.</li>
      </ul>

      <h2>Backup file format</h2>
      <Pre>{`{
  "version":    1,
  "exportedAt": "2026-05-11T10:00:00.000Z",
  "data": {
    "workflows": [...],
    "scripts":   [...],
    "triggers":  [...],
    "runs":      [...],
    "secrets":   [{ "name": "MY_KEY", "value": "plaintext!" }]
  }
}`}</Pre>
    </div>
  );
}

function PageNodeReference({ category }: { category: string }) {
  const nodes = getAllNodes().filter((n) => n.category === category);

  return (
    <div className="docs-page">
      <h1>{category} Nodes</h1>
      <p className="docs-page-subtitle">
        {nodes.length} node{nodes.length !== 1 ? 's' : ''} in this category.
      </p>
      {nodes.map((def) => (
        <NodeCard key={def.type} def={def} />
      ))}
    </div>
  );
}

function PageShortcuts() {
  const shortcuts: { keys: string[]; description: string }[] = [
    { keys: ['Ctrl', 'S'],        description: 'Save the current workflow' },
    { keys: ['Ctrl', 'Z'],        description: 'Undo last canvas change' },
    { keys: ['Ctrl', 'R'],        description: 'Redo' },
    { keys: ['Ctrl', 'C'],        description: 'Copy selected nodes (and their internal edges)' },
    { keys: ['Ctrl', 'X'],        description: 'Cut selected nodes' },
    { keys: ['Ctrl', 'V'],        description: 'Paste copied/cut nodes' },
    { keys: ['Delete', 'Backspace'], description: 'Delete selected nodes or edges' },
    { keys: ['Escape'],           description: 'Deselect all / close modal' },
    { keys: ['Ctrl', 'A'],        description: 'Select all nodes' },
    { keys: ['Right-drag'],       description: 'Rectangle-select multiple nodes' },
    { keys: ['Scroll'],           description: 'Zoom in/out on the canvas' },
    { keys: ['Middle-drag'],      description: 'Pan the canvas' },
    { keys: ['Space + drag'],     description: 'Pan the canvas (alternative)' },
  ];

  return (
    <div className="docs-page">
      <h1>Keyboard Shortcuts</h1>
      <p className="docs-page-subtitle">Shortcuts active when the canvas has focus.</p>

      <table className="docs-table docs-shortcuts-table">
        <thead>
          <tr><th>Shortcut</th><th>Action</th></tr>
        </thead>
        <tbody>
          {shortcuts.map(({ keys, description }, i) => (
            <tr key={i}>
              <td>
                {keys.map((k, j) => (
                  <span key={k}>
                    <Kbd>{k}</Kbd>
                    {j < keys.length - 1 && <span style={{ margin: '0 3px', color: 'var(--text3)' }}>+</span>}
                  </span>
                ))}
              </td>
              <td>{description}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Monaco editor shortcuts</h2>
      <p>Fields powered by Monaco (Transform, GraphQL, Script code) support standard editor shortcuts:</p>
      <table className="docs-table docs-shortcuts-table">
        <thead><tr><th>Shortcut</th><th>Action</th></tr></thead>
        <tbody>
          <tr><td><Kbd>Ctrl</Kbd>+<Kbd>Space</Kbd></td><td>Trigger autocomplete</td></tr>
          <tr><td><Kbd>Ctrl</Kbd>+<Kbd>/</Kbd></td><td>Toggle line comment</td></tr>
          <tr><td><Kbd>Alt</Kbd>+<Kbd>↑/↓</Kbd></td><td>Move line up/down</td></tr>
          <tr><td><Kbd>Ctrl</Kbd>+<Kbd>D</Kbd></td><td>Duplicate line</td></tr>
          <tr><td><Kbd>Shift</Kbd>+<Kbd>Alt</Kbd>+<Kbd>F</Kbd></td><td>Format document</td></tr>
        </tbody>
      </table>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type Props = { pageId: string; onHome: () => void };

export const DocsView = ({ pageId, onHome }: Props) => {
  const activePage = pageId;
  const [searchQuery, setSearchQuery] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [activePage]);

  const goToPage = (id: string) => {
    setSearchQuery('');
    routeNavigate({ space: 'docs', pageId: id });
  };

  const searchResults = doSearch(searchQuery);
  const isSearching = searchQuery.length >= 2;

  const renderPage = () => {
    switch (activePage) {
      case 'introduction':        return <PageIntroduction />;
      case 'getting-started':     return <PageGettingStarted />;
      case 'concepts-workflows':  return <PageConceptWorkflows />;
      case 'concepts-nodes':      return <PageConceptNodes />;
      case 'concepts-variables':  return <PageConceptVariables />;
      case 'concepts-scripts':    return <PageConceptScripts />;
      case 'concepts-triggers':   return <PageConceptTriggers />;
      case 'concepts-simulation': return <PageConceptRunPanel />;
      case 'guide-datastore':      return <PageDataStore />;
      case 'guide-jobs':          return <PageJobs />;
      case 'guide-run-workflow':  return <PageRunWorkflow />;
      case 'guide-whatsapp':      return <PageWhatsAppBridge />;
      case 'guide-plugins':       return <PagePlugins />;
      case 'guide-ai':            return <PageGuideAI />;
      case 'guide-admin':         return <PageAdmin />;
      case 'ref-Logic':           return <PageNodeReference category="Logic" />;
      case 'ref-Control':         return <PageNodeReference category="Control" />;
      case 'ref-Data':            return <PageNodeReference category="Data" />;
      case 'ref-Data Store':      return <PageNodeReference category="Data Store" />;
      case 'ref-File':            return <PageNodeReference category="File" />;
      case 'ref-Integration':     return <PageNodeReference category="Integration" />;
      case 'ref-Notification':    return <PageNodeReference category="Notification" />;
      case 'ref-AI':              return <PageNodeReference category="AI" />;
      case 'shortcuts':           return <PageShortcuts />;
      default:                    return <PageIntroduction />;
    }
  };

  return (
    <div className="app-shell">
      <AppHeader onHome={onHome} title="Documentation" />

      <div className="main-area">
        <nav className="docs-sidebar">
          <div className="docs-search">
            <input
              className="docs-search-input"
              type="search"
              placeholder="Search docs…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setSearchQuery(''); }}
            />
          </div>

          {isSearching ? (
            <div className="docs-search-results">
              {searchResults.length === 0 ? (
                <div className="docs-search-empty">No results for &ldquo;{searchQuery}&rdquo;</div>
              ) : (
                searchResults.map((entry, i) => (
                  <button
                    key={i}
                    className="docs-search-result"
                    onClick={() => goToPage(entry.pageId)}
                  >
                    <span className="docs-search-result-label">{entry.pageLabel}</span>
                    <span className="docs-search-result-snippet">{getSnippet(entry.text, searchQuery)}</span>
                  </button>
                ))
              )}
            </div>
          ) : (
            NAV.map((item) => (
              <div key={item.id}>
                {item.sectionHeader && (
                  <div className="docs-nav-section">{item.sectionHeader}</div>
                )}
                <button
                  className={`docs-nav-link${activePage === item.id ? ' docs-nav-link--active' : ''}`}
                  onClick={() => goToPage(item.id)}
                >
                  {item.label}
                </button>
              </div>
            ))
          )}
        </nav>

        <div className="docs-content" ref={contentRef}>
          {renderPage()}
        </div>
      </div>
    </div>
  );
};
