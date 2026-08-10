import vm from 'vm';
import type { ExecutionContext } from '../types';

const TEMPLATE_RE = /\{\{([^}]*)\}\}/g;

// One sandbox context per worker process. Globals are a curated set:
// require / process / global / Buffer are never exposed; fetch IS exposed
// deliberately so transforms/scripts can call HTTP APIs.
// codeGeneration prevents eval() and new Function() from inside user code.
const _ctx = vm.createContext(
  {
    Math, Number, String, Boolean, Array, Object, JSON,
    Date, RegExp, Error, TypeError, RangeError,
    parseInt, parseFloat, isNaN, isFinite,
    encodeURIComponent, decodeURIComponent,
    fetch,
    URL, URLSearchParams,
    Headers, Request, Response,
    AbortController, AbortSignal,
    Promise,
  },
  { name: 'workflow-sandbox', codeGeneration: { strings: false, wasm: false } }
);

// Compile AND invoke user code inside the vm so the timeout covers execution.
// (Compiling a function via runInContext and calling it afterwards would leave
// the call itself unbounded — a `while(true)` would block the worker forever.)
// Arguments are passed through a temporary context global; the sandbox is
// single-threaded per worker, so this cannot race.
// Note: the timeout bounds synchronous execution only — awaited Promises
// (e.g. fetch) are not interrupted.
function callInSandbox(fnSource: string, args: unknown[], timeoutMs: number): unknown {
  (_ctx as Record<string, unknown>).__args = args;
  try {
    return vm.runInContext(`(${fnSource}).apply(undefined, __args);`, _ctx, {
      timeout: Math.max(1, Math.round(timeoutMs)),
    });
  } finally {
    delete (_ctx as Record<string, unknown>).__args;
  }
}

export const buildOutputsMap = (context: ExecutionContext): Record<string, unknown> =>
  Object.fromEntries(Object.entries(context.results).map(([id, r]) => [id, r.output]));

const VALID_IDENTIFIER = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

// Resolve a path/expression inside the sandbox.
// Keys are filtered to valid JS identifiers so that workflow variables with
// special characters (spaces, dashes, etc.) never cause a SyntaxError in the
// generated function signature — they remain accessible via variables["key"].
// Returns { ok: true, value } or { ok: false, error } so callers can decide
// whether to surface or suppress the failure.
function resolvePath(obj: Record<string, unknown>, path: string): { ok: true; value: unknown } | { ok: false; error: Error } {
  const keys = Object.keys(obj).filter(k => VALID_IDENTIFIER.test(k));
  const vals = keys.map(k => obj[k]);
  const sanitized = path.trim().replace(/\\"/g, '"');
  try {
    const value = callInSandbox(
      `function(${keys.join(', ')}) { "use strict"; return (${sanitized}); }`,
      vals,
      1000,
    );
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

function applyTemplates(str: string, evalCtx: Record<string, unknown>): string {
  TEMPLATE_RE.lastIndex = 0;
  return str.replace(TEMPLATE_RE, (_, path: string) => {
    const res = resolvePath(evalCtx, path);
    if (!res.ok) {
      throw new Error(`Template error: {{${path}}} — ${res.error.message}`);
    }
    const { value } = res;
    return value !== undefined && value !== null ? String(value) : '';
  });
}

export function resolveString(str: string, context: ExecutionContext): string {
  if (!str.includes('{{')) return str;
  const outputs = buildOutputsMap(context);
  return applyTemplates(
    str,
    { ...context.variables, variables: context.variables, outputs, secrets: context.secrets, input: context.input },
  );
}

export function evaluateExpression(expr: string, context: ExecutionContext): unknown {
  const trimmed = expr.trim();

  // Single {{path}} — evaluate the inner expression as JS and return the raw typed value.
  // Falling through to applyTemplates would stringify it (e.g. boolean false → "false" → truthy).
  const singleTemplate = /^\{\{([^}]*)\}\}$/.exec(trimmed);
  if (singleTemplate) {
    const inner = singleTemplate[1].trim().replace(/\\"/g, '"');
    const outputs = buildOutputsMap(context);
    try {
      return callInSandbox(
        `function(context, variables, outputs, secrets, input, trigger) { "use strict"; return (${inner}); }`,
        [context, context.variables, outputs, context.secrets, context.input, context.variables.trigger ?? null],
        2000,
      );
    } catch (e) {
      throw new Error(`Expression error [${inner}]: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (TEMPLATE_RE.test(trimmed)) {
    TEMPLATE_RE.lastIndex = 0;
    const outputs = buildOutputsMap(context);
    return applyTemplates(
      trimmed,
      { ...context.variables, variables: context.variables, outputs, secrets: context.secrets, input: context.input },
    );
  }

  try {
    const outputs = buildOutputsMap(context);
    return callInSandbox(
      `function(context, variables, outputs, secrets, input, trigger) { "use strict"; return (${trimmed}); }`,
      [context, context.variables, outputs, context.secrets, context.input, context.variables.trigger ?? null],
      2000,
    );
  } catch (e) {
    throw new Error(`Expression error [${trimmed}]: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// Run arbitrary user code with named parameters inside the sandbox.
// withScope: wraps code in `with(firstArg) { ... }` — no strict mode, allows short variable access.
// Used by math node so expressions like `x + y` resolve from variables automatically.
// timeoutMs bounds synchronous execution (awaited Promises are not interrupted).
export function runUserCode(
  code: string,
  paramNames: string[],
  args: unknown[],
  timeoutMs: number,
  withScope = false,
): unknown {
  const body = withScope
    ? `with(${paramNames[0]}) { ${code} }`
    : `"use strict"; ${code}`;
  return callInSandbox(`function(${paramNames.join(', ')}) { ${body} }`, args, timeoutMs);
}
