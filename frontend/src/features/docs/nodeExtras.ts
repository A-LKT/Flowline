export interface NodeExtra {
  longDescription: string;
  outputShape: string;
  tips?: string[];
}

export const nodeExtras: Record<string, NodeExtra> = {
  failure: {
    longDescription: 'Always fails with an error, regardless of input or configuration. Use this node to test that error edges, failure handlers, and downstream error paths behave correctly.',
    outputShape: 'null',
    tips: [
      'Connect an error edge from this node to verify your error-handling branch.',
      'Disable the node to bypass the failure during normal runs.',
    ],
  },
  condition: {
    longDescription:
      'Evaluates a JavaScript expression and routes execution to either the true or false output handle. ' +
      'The expression has access to the full execution context: upstream node outputs via outputs["nodeId"], ' +
      'workflow variables via variables.name, and the log() helper. ' +
      'Use Condition when you need to split a workflow into two mutually exclusive paths.',
    outputShape: '{ result: boolean }',
    tips: [
      'Access upstream results with outputs["nodeId"] — use the exact node ID from the canvas.',
      'Compare arrays: outputs["fetch"].items.length > 0',
      'Chain conditions to model if/else-if logic.',
    ],
  },

  fork: {
    longDescription:
      'Functionally identical to the Condition node but rendered as a diamond shape on the canvas. ' +
      'Use Fork to make branching logic visually prominent, especially at key decision points in complex workflows. ' +
      'The expression context is the same as Condition: outputs, variables, and log are all in scope.',
    outputShape: '{ result: boolean }',
    tips: [
      'Fork and Condition are interchangeable — choose whichever reads better in context.',
      'Label the outgoing edges (true / false) for clarity when the canvas is dense.',
    ],
  },

  switch: {
    longDescription:
      'Evaluates an expression to a string value and routes execution to the matching case output handle. ' +
      'You can define up to four named cases. If the expression result does not match any case, execution ' +
      'follows the default handle. Cases are compared with strict string equality.',
    outputShape: '{ matched: string }',
    tips: [
      'Case names become edge labels and handle IDs — keep them short and descriptive.',
      'The default handle always fires when no case matches; wire it to an error handler or a Log node.',
      'Use outputs["nodeId"] to route on upstream response codes, statuses, or categories.',
    ],
  },

  script: {
    longDescription:
      'Executes a named script defined in the Scripts space. Scripts are standalone JavaScript functions ' +
      'that receive an input object (resolved from input bindings you configure) and a context object ' +
      '(containing outputs, variables, and log). The return value of the script becomes this node\'s output. ' +
      'Scripts can be shared across multiple workflows, making them the right place for reusable business logic.',
    outputShape: 'whatever value the script returns',
    tips: [
      'Define input bindings in the config panel to map node outputs or variables into named script inputs.',
      'Scripts time out after the duration configured on the script (default 3 s).',
      'Return a plain object from your script so downstream nodes can destructure it cleanly.',
      'Use the Scripts space to test your script in isolation before wiring it into a workflow.',
    ],
  },

  delay: {
    longDescription:
      'Pauses workflow execution for a fixed number of milliseconds before passing control to the next node. ' +
      'Useful for rate-limiting requests to external APIs, inserting a wait between polling attempts, ' +
      'or creating timed notification sequences. The maximum configurable delay is 300 seconds (300,000 ms).',
    outputShape: '{ delayMs: number }',
    tips: [
      'Very large delays will hold the workflow runner thread — prefer trigger scheduling for long waits.',
      'Chain Delay → HTTP → Delay to pace burst requests within API rate limits.',
    ],
  },

  'set-variable': {
    longDescription:
      'Creates or updates a named workflow variable. Variables are scoped to the entire workflow execution ' +
      'and are visible to all downstream nodes regardless of branching. Use Set Variable to accumulate ' +
      'state across iterations, share data between parallel branches, or store intermediate results ' +
      'without creating unnecessary node-to-node edges.',
    outputShape: '{ name: string, value: unknown }',
    tips: [
      'Access variables downstream with variables.myVar or {{variables.myVar}} in expression fields.',
      'Set Variable inside a Loop to accumulate results across iterations.',
      'Variable values are serialised as JSON — complex objects work fine.',
    ],
  },

  log: {
    longDescription:
      'Emits a message to the execution log at a configurable severity level (info, warn, or error). ' +
      'Log nodes are pass-through: they do not modify the data flowing through the workflow. ' +
      'Log messages appear in the Run panel\'s log tab during a run and are stored with the run history.',
    outputShape: 'passes input through unchanged',
    tips: [
      'Use warn and error levels to make important events easy to spot in the log.',
      'Interpolate values with {{outputs["nodeId"].field}} in the message field.',
      'Insert a Log node before and after a risky step to bracket execution in the log.',
    ],
  },

  label: {
    longDescription:
      'A purely decorative annotation node. Labels have no input or output handles and take no part in ' +
      'execution. Use them to add section headings, comments, or instructions directly on the canvas ' +
      'to make large workflows self-documenting.',
    outputShape: 'none — no handles, no execution effect',
    tips: [
      'Use large labels as section headers to divide a complex workflow into named zones.',
      'Labels survive export/import, so they travel with the workflow JSON.',
    ],
  },

  junction: {
    longDescription:
      'An invisible routing waypoint rendered as a small dot (18 × 18 px) on the canvas. Junctions allow ' +
      'you to create structured, right-angle edge paths through busy areas of the canvas without adding ' +
      'any logic. They snap to the 8 px sub-grid for precise alignment.',
    outputShape: 'passes through — no execution effect',
    tips: [
      'Place junctions at corners to keep long edges from crossing other nodes.',
      'Chain two junctions to route an edge around an obstacle.',
    ],
  },

  loop: {
    longDescription:
      'Repeats a sub-graph while a boolean condition expression remains true. On each iteration, the ' +
      'loop handle fires and the iteration counter increments. When the condition becomes false, the ' +
      'main output fires and execution continues. maxIterations (default 100, max 10,000) caps runaway loops.',
    outputShape: '{ iteration: number }',
    tips: [
      'Reference the current iteration count as outputs["loopNodeId"].iteration inside the loop.',
      'Use Set Variable inside the loop to accumulate results; read the variable after the loop exits.',
      'Add a Log node at the start of the loop body during development to trace iteration progress.',
      'Always verify your condition can become false — the maxIterations limit is a safety net, not a design goal.',
    ],
  },

  transform: {
    longDescription:
      'Executes arbitrary JavaScript to produce a new value. Write the function body — the last expression ' +
      'or return statement becomes this node\'s output. The execution context injects outputs (a map of ' +
      'all upstream results keyed by node ID), variables, and log. Transform is the escape hatch for any ' +
      'data manipulation that the specialised Data nodes do not cover.',
    outputShape: 'whatever value the transform body returns',
    tips: [
      'Return a plain object to give downstream nodes a clear, named structure to reference.',
      'Use const declarations freely — the body runs in strict mode inside a Function constructor.',
      'Access upstream data: const items = outputs["httpNode"].data; return items.map(...).',
      'Avoid async code — Transform is synchronous. Use Script nodes for async logic.',
    ],
  },

  filter: {
    longDescription:
      'Filters an array using a predicate expression. The predicate is evaluated for each element with ' +
      'item, index, array, outputs, and variables available in scope. Elements for which the predicate ' +
      'is truthy are kept; the rest are discarded.',
    outputShape: '{ result: unknown[], count: number }',
    tips: [
      'The predicate is a single expression, not a function body: item.status === "active".',
      'Pipe Filter → Aggregate to count matching elements.',
      'The count in the output reflects the filtered length, not the original array length.',
    ],
  },

  sort: {
    longDescription:
      'Sorts an array of objects by a specified field. The comparison is automatically numeric when both ' +
      'values coerce cleanly to numbers, and lexicographic otherwise. Supports ascending and descending order. ' +
      'The original array is not mutated; a new sorted copy is returned.',
    outputShape: '{ result: unknown[], count: number }',
    tips: [
      'Leave the Field empty to sort an array of primitives directly.',
      'Pipe Sort → Filter if you need the top-N pattern: sort descending, then filter by index.',
    ],
  },

  aggregate: {
    longDescription:
      'Reduces an array to a single computed value. The operation field selects the reduction strategy: ' +
      'count (length), sum, avg, min, max (numeric on the specified field), first (first element), ' +
      'last (last element), or join (string join with a configurable separator). ' +
      'The Field config is required for sum, avg, min, max, and join.',
    outputShape: '{ result: unknown, operation: string, count: number }',
    tips: [
      'For count, leave Field empty — only the array length matters.',
      'For join, the separator defaults to ", " — override it for CSV-style output.',
      'Pipe HTTP → Aggregate to count items in a paginated API response.',
    ],
  },

  'render-template': {
    longDescription:
      'Interpolates a template string using {{expression}} placeholders. Each placeholder is evaluated ' +
      'with outputs and variables in scope. Use Render Template to assemble URLs, email bodies, Slack ' +
      'messages, or any dynamic string from workflow data — without writing a full Transform node.',
    outputShape: '{ text: string }',
    tips: [
      'Placeholders can contain any JS expression: {{outputs["node"].items.length}} items found.',
      'Escape literal braces by doubling them: {{ }} renders as {}.',
      'Nest template output into an HTTP body by pointing the HTTP node\'s body field at outputs["renderNode"].text.',
    ],
  },

  math: {
    longDescription:
      'Evaluates a mathematical expression string. The environment provides Math, Number, parseInt, and ' +
      'parseFloat. The expression can reference outputs and variables directly. Use Math when you need a ' +
      'quick numeric calculation without the overhead of a full Transform node.',
    outputShape: '{ result: number }',
    tips: [
      'Full JS math: Math.round(outputs["price"].value * 1.23 * 100) / 100',
      'The result is always a number — pipe it through Render Template if you need a formatted string.',
    ],
  },

  'parse-csv': {
    longDescription:
      'Parses a CSV string into an array of row objects (or arrays if no headers are present). ' +
      'Automatically trims whitespace from field values. Useful after reading a file with the Read File ' +
      'node, or when an HTTP endpoint returns CSV-formatted data.',
    outputShape: '{ rows: object[], count: number }',
    tips: [
      'The first row is treated as a header row and becomes the object keys.',
      'Pipe Read File → Parse CSV to process a remote CSV file in one step.',
      'Use Filter and Sort downstream to clean and order the parsed rows.',
    ],
  },

  'format-csv': {
    longDescription:
      'Converts an array of objects to a CSV string. The header row is derived from the keys of the first ' +
      'element in the array. All values are coerced to strings. Useful for exporting processed data ' +
      'before triggering a Write File download.',
    outputShape: '{ csv: string, count: number }',
    tips: [
      'Pipe Format CSV → Write File to let the user download the result.',
      'Ensure all objects in the array have the same keys; missing keys will produce empty cells.',
    ],
  },

  'read-file': {
    longDescription:
      'Fetches a resource from a URL using the browser\'s Fetch API and returns the content in the ' +
      'requested format: text (raw string), json (parsed object), or base64 (encoded binary). ' +
      'The URL supports expression interpolation so you can build it dynamically from workflow data.',
    outputShape: '{ content: string | object, url: string }',
    tips: [
      'Use JSON format when the URL returns an API response — the parsed object is immediately usable downstream.',
      'Use base64 format for binary assets (images, PDFs) before passing them to another API.',
      'CORS restrictions apply — the target URL must allow cross-origin requests from the browser.',
    ],
  },

  'write-file': {
    longDescription:
      'Triggers a browser file download by creating a Blob from the provided content string and ' +
      'programmatically clicking a temporary anchor element. The download appears in the user\'s default ' +
      'download folder under the specified filename.',
    outputShape: '{ filename: string }',
    tips: [
      'Set Content-Type to text/csv or application/json to hint the browser how to handle the file.',
      'The content field should be a string — pipe Format CSV or Render Template upstream if needed.',
      'Write File requires a user-initiated workflow run; it will not fire silently in automated (trigger) runs.',
    ],
  },

  http: {
    longDescription:
      'Sends an HTTP request to any URL and returns the response status and body. Supported methods are ' +
      'GET, POST, PUT, DELETE, and PATCH. The Headers field accepts a JSON object of header key-value pairs. ' +
      'The Body field is a raw string — use Render Template upstream to construct dynamic payloads. ' +
      'HTTP nodes execute on the backend to avoid CORS restrictions and to keep credentials server-side.',
    outputShape: '{ status: number, data: unknown, url: string }',

    tips: [
      'Set Content-Type: application/json in Headers when sending JSON bodies.',
      'Use expression interpolation in the URL: https://api.example.com/users/{{variables.userId}}',
      'Chain multiple HTTP nodes with a Condition between them to handle success vs. error responses.',
    ],
  },

  graphql: {
    longDescription:
      'Executes a GraphQL query or mutation against an endpoint. The Query field accepts a full GraphQL ' +
      'document string. Variables are specified as a JSON object and are interpolated at runtime. ' +
      'Headers support expression placeholders for dynamic auth tokens.',
    outputShape: '{ data: object, errors?: object[] }',

    tips: [
      'Check errors before processing data — a 200 response can still contain GraphQL errors.',
      'Use Variables to pass dynamic values rather than interpolating directly into the query string.',
      'Store the auth token in a workflow variable and reference it in the Authorization header.',
    ],
  },

  ping: {
    longDescription:
      'Sends an ICMP echo request to a hostname or IP address and reports whether the host responded ' +
      'and the round-trip time in milliseconds. Ping runs on the backend because browsers cannot send raw ICMP packets. ' +
      'Use it to verify that a target is reachable before attempting a connection-heavy operation.',
    outputShape: '{ host: string, alive: boolean, time: number | null }',

    tips: [
      'Pipe Ping → Condition to gate downstream nodes on whether the host is alive.',
      'time is null when alive is false.',
      'Some hosts block ICMP — alive: false does not necessarily mean the host is down.',
    ],
  },

  'send-email': {
    longDescription:
      'Posts an email payload to a configured HTTP endpoint URL. The node does not ship its own SMTP client; ' +
      'instead, it acts as a thin wrapper that calls your email service\'s HTTP API (SendGrid, Mailgun, Postmark, ' +
      'or a custom relay). Configure the service URL to match your provider\'s send endpoint and add any ' +
      'required auth headers.',
    outputShape: '{ status: number, response: unknown }',
    tips: [
      'Store your API key in a workflow variable and reference it in the request (via the service URL or a preceding HTTP node).',
      'Use Render Template to build the email body from workflow data before passing it to this node.',
      'Test with a service like Mailtrap during development to avoid sending real emails.',
    ],
  },

  'send-slack': {
    longDescription:
      'Posts a message to a Slack channel via a Slack Incoming Webhook URL. The message text supports ' +
      'Slack\'s mrkdwn formatting: *bold*, _italic_, `code`, and <url|link>. ' +
      'Create a Slack app and activate Incoming Webhooks in your workspace to obtain the webhook URL.',
    outputShape: '{ status: number }',
    tips: [
      'Use Render Template upstream to build rich, data-driven message text.',
      'A 200 response with body "ok" means Slack accepted the message.',
      'Keep webhook URLs in workflow variables — they are sensitive credentials.',
    ],
  },

  'send-teams': {
    longDescription:
      'Posts a MessageCard payload to a Microsoft Teams channel via an Incoming Webhook URL. ' +
      'MessageCards support a title, text body, and action buttons. ' +
      'To set up a webhook, open the channel in Teams, click the three-dot menu → Connectors → Incoming Webhook.',
    outputShape: '{ status: number }',
    tips: [
      'The text field supports a limited subset of Markdown — bold (**text**) and links work.',
      'For richer cards, send an Adaptive Card payload via an HTTP node instead.',
      'Keep the webhook URL in a workflow variable to avoid exposing it in the canvas.',
    ],
  },

  'transcribe-audio': {
    longDescription:
      'Sends an audio URL to the Voice to Text sidecar service and returns the transcript as a string. ' +
      'The node POSTs { url, language? } to the configured endpoint and reads the text or transcript field ' +
      'from the JSON response. Pair it with a WhatsApp trigger to transcribe incoming voice notes automatically.',
    outputShape: '{ text: string }',

    tips: [
      'Default audioUrl is {{trigger.media[0].url}} — works directly with WhatsApp voice note triggers.',
      'Set language to a BCP-47 code (e.g. "pl", "en") if your V2T service supports language hints.',
      'Adjust the endpoint field to match your container\'s API path if it differs from /transcribe.',
      'The V2T service URL is configured via VOICE_TO_TEXT_URL (default: http://voice-to-text:9000).',
    ],
  },

  'ollama-completion': {
    longDescription:
      'Sends a prompt to a locally-running Ollama model and returns the generated text. ' +
      'The node POSTs { model, prompt, system?, options: { temperature } } to /api/generate with stream: false ' +
      'and reads the response field from the JSON reply. ' +
      'Ollama must be running and the requested model must already be pulled (ollama pull <model>).',
    outputShape: '{ text: string, model: string }',

    tips: [
      'Set model to the exact name shown by "ollama list" — e.g. "llama3", "mistral", "phi3".',
      'Use the system field to set a persistent instruction that shapes all responses from the model.',
      'Temperature 0 gives deterministic output; values above 1 increase randomness.',
      'The Ollama URL is configured via OLLAMA_URL (default: http://host.docker.internal:11434).',
    ],
  },

  'ai-completion': {
    longDescription:
      'Sends a prompt to a large-language-model provider (OpenAI, Anthropic Claude, or Perplexity) and ' +
      'returns the generated text. API credentials are read from the Secrets store — no keys are embedded ' +
      'in the workflow. Select the provider, optionally override the default model, write an optional ' +
      'system instruction, and write the prompt (both fields support {{expression}} interpolation). ' +
      'Set maxTokens to 0 to use each provider\'s default limit.',
    outputShape: '{ text: string, model: string, provider: string, usage: { inputTokens: number, outputTokens: number } }',

    tips: [
      'Add your API keys in Settings → Secrets: OPENAI_API_KEY, ANTHROPIC_API_KEY, or PERPLEXITY_API_KEY.',
      'Use the system field to give the model a persistent role or instruction (e.g. "You are a concise summariser.").',
      'Interpolate upstream data into the prompt: Summarise this article: {{outputs["httpNode"].data.content}}',
      'maxTokens 0 means "provider default" (Anthropic defaults to 1024, OpenAI is uncapped).',
      'temperature 0 gives deterministic output; increase it for creative tasks.',
    ],
  },

  datetime: {
    longDescription:
      'Returns the current date and/or time, optionally offset by a number of minutes. ' +
      'Outputs both a human-readable value string formatted for the selected mode and a full ISO-8601 timestamp. ' +
      'Use it to stamp records, calculate relative deadlines, or label generated files.',
    outputShape: '{ value: string, iso: string, timestamp: number }',
    tips: [
      'Use iso downstream to compare dates — it is always a full UTC ISO string.',
      'timestamp is Unix milliseconds — compatible with the JS Date constructor.',
      'Combine with Render Template to produce user-friendly date strings in notifications.',
    ],
  },

  'run-workflow': {
    longDescription:
      'Triggers another workflow from within the current workflow. ' +
      'In sync mode, the executor waits for the child workflow to finish and returns its full node results; ' +
      'in async mode it fires and returns immediately with the child run ID. ' +
      'Pass initial variable values as a JSON object in the Variables field. ' +
      'A nesting depth guard (MAX_DEPTH = 5) prevents infinite recursive calls.',
    outputShape: 'sync: Record<nodeId, NodeExecutionResult> | async: { runId: string, mode: "async" }',

    tips: [
      'Use async mode for long-running child workflows that do not need to complete before the parent continues.',
      'Pass data to the child via the variables field: {"userId": "{{variables.userId}}"}.',
      'In sync mode, access child results with outputs["runNode"].childNodeId.output downstream.',
      'The depth guard counts the full chain: parent → child → grandchild. Keep nesting shallow.',
    ],
  },

  'datastore-query': {
    longDescription:
      'Queries rows from a Data Store table. An optional filter object restricts results to rows where ' +
      'all specified key/value pairs match exactly. The limit field caps the number of rows returned (max 1000). ' +
      'Returns the matching rows as an array.',
    outputShape: '{ rows: object[], count: number }',

    tips: [
      'Leave filter empty to return all rows up to the limit.',
      'Filter must be a JSON object — each key/value pair becomes a WHERE key = value clause. Example: {"video_url": "{{input.item}}"} matches rows where video_url equals the current iterator item.',
      'Do not use comparison operators (==, ===) in the filter field — it is not a boolean expression, it is an equality map.',
      'Pipe the output to Filter or Sort for additional in-memory processing.',
      'The table ID is set in the config panel — select a table from the Data Store.',
    ],
  },

  'datastore-upsert': {
    longDescription:
      'Inserts or updates a row in a Data Store table. If one or more columns are marked as key columns ' +
      'and the incoming data matches an existing row\'s key values, that row is updated in place; otherwise ' +
      'a new row is inserted. The data field accepts a JSON object or an expression that resolves to one.',
    outputShape: '{ action: "inserted" | "updated", row: object }',

    tips: [
      'Mark at least one column as a key (🔑 icon in the Data Store) to enable upsert semantics.',
      'Without a key column every call inserts a new row — useful for append-only logs.',
      'Default data expression is {{JSON.stringify(input)}} — pass the upstream node output directly.',
      'Column names in the data object must match the table schema exactly (case-sensitive).',
    ],
  },

  'ollama-vision': {
    longDescription:
      'Sends an image and a text prompt to a vision-capable Ollama model (e.g. llava, moondream) and ' +
      'returns a description or answer. The image can be a file path accessible to the backend container ' +
      'or a base64-encoded string. Pair with the WhatsApp trigger to analyse photos sent via chat.',
    outputShape: '{ text: string, model: string }',

    tips: [
      'Use trigger.media[0] as the image field to process photos from WhatsApp messages.',
      'The model must support vision — check "ollama list" and pull e.g. "llava:7b" if needed.',
      'Provide a specific prompt like "List all items and their prices" for structured extraction.',
      'The Ollama URL is configured via OLLAMA_URL (default: http://host.docker.internal:11434).',
    ],
  },

  'send-whatsapp': {
    longDescription:
      'Sends a WhatsApp message by calling the local WhatsApp Bridge service. ' +
      'The bridge must be running (see Guides → WhatsApp Bridge). ' +
      'The to field is the recipient\'s WhatsApp JID (e.g. 48511335900@s.whatsapp.net) ' +
      'or the sender\'s JID from a trigger — use {{trigger.sender}} to reply to the person who triggered the workflow.',
    outputShape: '{ to: string, text: string }',

    tips: [
      'Default to field is {{trigger.sender}} — this replies to whoever sent the command.',
      'The bridge URL is configured via the WHATSAPP_BRIDGE_URL environment variable (default: http://whatsapp-bridge:3002).',
      'Use Render Template upstream to build a rich reply from workflow results before passing it to this node.',
    ],
  },
};
