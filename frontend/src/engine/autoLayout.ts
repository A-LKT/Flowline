import type { LayoutDirection, WorkflowEdge, WorkflowNode } from '../types/workflow';

// Spacing constants — chosen so edges have room to breathe at both directions.
const SPACING: Record<LayoutDirection, { main: number; cross: number }> = {
  TB: { main: 130, cross: 220 }, // Y per layer, X between siblings
  LR: { main: 260, cross: 100 }, // X per layer, Y between siblings
};

export const computeLayout = (
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  direction: LayoutDirection,
): WorkflowNode[] => {
  if (nodes.length === 0) return nodes;

  // Build adjacency + in-degree for Kahn's topological layering
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const n of nodes) {
    adj.set(n.id, []);
    inDegree.set(n.id, 0);
  }
  for (const e of edges) {
    adj.get(e.from)?.push(e.to);
    inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1);
  }

  // Kahn's BFS → ordered layers
  const layers: string[][] = [];
  const visited = new Set<string>();
  let frontier = [...inDegree.entries()].filter(([, d]) => d === 0).map(([id]) => id);

  while (frontier.length > 0) {
    layers.push(frontier);
    const next: string[] = [];
    for (const id of frontier) {
      visited.add(id);
      for (const neighbor of adj.get(id) ?? []) {
        const deg = (inDegree.get(neighbor) ?? 0) - 1;
        inDegree.set(neighbor, deg);
        if (deg === 0 && !visited.has(neighbor)) next.push(neighbor);
      }
    }
    frontier = next;
  }

  // Append any nodes that weren't reached (cycles / disconnected subgraphs)
  const unplaced = nodes.filter((n) => !visited.has(n.id)).map((n) => n.id);
  if (unplaced.length > 0) layers.push(unplaced);

  const { main, cross } = SPACING[direction];
  const posMap = new Map<string, { x: number; y: number }>();

  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li];
    const mainPos = li * main;
    const totalCross = (layer.length - 1) * cross;

    for (let ni = 0; ni < layer.length; ni++) {
      const crossPos = -totalCross / 2 + ni * cross;
      posMap.set(
        layer[ni],
        direction === 'TB'
          ? { x: crossPos, y: mainPos }
          : { x: mainPos, y: crossPos },
      );
    }
  }

  return nodes.map((n) => ({ ...n, position: posMap.get(n.id) ?? n.position }));
};
