export type ScriptInputType = 'string' | 'number' | 'boolean';

export type ScriptInput = {
  name: string;
  description?: string;
  type?: ScriptInputType;
};

export type InputBinding =
  | { kind: 'node'; nodeId: string }
  | { kind: 'primitive'; value: string | number | boolean }
  | { kind: 'variable'; varName: string };

export type Script = {
  id: string;
  name: string;
  description?: string;
  code: string;
  timeout: number;
  inputs?: ScriptInput[];
  sandbox?: boolean;
  dockerImage?: string;
  npmInstall?: string;
  createdAt: number;
  updatedAt: number;
};
