import type { ZodSchema } from 'zod';

export type FieldMeta = {
  type: 'text' | 'number' | 'textarea' | 'checkbox' | 'select' | 'monaco' | 'script-select' | 'ollama-model' | 'datastore-table' | 'workflow-select';
  options?: string[];
  language?: string;
  hint?: string;
};

export type NodeDefinition = {
  type: string;
  label: string;
  description: string;
  category: string;
  plugin?: string;
  configSchema: ZodSchema;
  defaultConfig: Record<string, unknown>;
  fieldMeta?: Record<string, FieldMeta>;
};
