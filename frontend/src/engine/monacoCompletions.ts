export type CompletionNode = { id: string; name?: string; type: string };

export const buildExtraLib = (nodes: CompletionNode[], secretNames: string[] = []): string => {
  const entries = nodes
    .map((n) => {
      const comment = n.name ? `${n.name} (${n.type})` : n.type;
      return `    /** ${comment} */\n    "${n.id}": unknown;`;
    })
    .join('\n');

  const secretEntries = secretNames
    .map((n) => `  /** encrypted secret */\n  ${n}: string;`)
    .join('\n');

  return `
declare const input: Record<string, unknown>;
declare const secrets: {
${secretEntries}
  [name: string]: string;
};
declare const context: {
  /** Workflow-level variables */
  variables: Record<string, unknown>;
  /** Decrypted secrets — use secrets.NAME or context.secrets.NAME */
  secrets: {
${secretEntries}
    [name: string]: string;
  };
  /** Raw execution results keyed by node ID */
  results: Record<string, {
    nodeId: string;
    status: "idle" | "running" | "success" | "error";
    output: unknown;
    error?: string;
    startedAt: number;
    finishedAt: number;
  }>;
  /** outputs[nodeId] is shorthand for results[nodeId].output */
  outputs: {
${entries}
    [nodeId: string]: unknown;
  };
};
`;
};
