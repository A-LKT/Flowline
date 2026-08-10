import { z } from 'zod';
import { registerNode } from '../engine/nodeRegistry';

const configSchema = z.object({
  url:       z.string().min(1, 'Endpoint URL is required'),
  query:     z.string().min(1, 'Query is required'),
  variables: z.string().default(''),
  headers:   z.string().default(''),
});

registerNode({
  type: 'graphql',
  label: 'GraphQL',
  description: 'Executes a GraphQL query or mutation against an endpoint.',
  category: 'Integration',
  configSchema,
  defaultConfig: { url: '', query: '{ __typename }', variables: '', headers: '' },
  fieldMeta: {
    query:     { type: 'monaco', language: 'graphql' },
    variables: { type: 'textarea' },
    headers:   { type: 'textarea' },
  },
});
