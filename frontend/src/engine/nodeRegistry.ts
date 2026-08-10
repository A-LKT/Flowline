import type { NodeDefinition } from '../types/node';

const registry = new Map<string, NodeDefinition>();

export const registerNode = (def: NodeDefinition): void => {
  registry.set(def.type, def);
};

export const getNode = (type: string): NodeDefinition | undefined => registry.get(type);

export const getAllNodes = (): NodeDefinition[] => Array.from(registry.values());
