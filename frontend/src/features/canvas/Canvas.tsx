import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type ReactFlowInstance,
  type Node,
  type Edge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ZodSchema } from 'zod';
import { getNode } from '../../engine/nodeRegistry';
import { useWorkflowStore } from '../../state/workflowStore';
import { useSettingsStore } from '../../state/settingsStore';
import type { LayoutDirection, WorkflowEdge, WorkflowNode } from '../../types/workflow';
import { WorkflowNodeComponent } from './WorkflowNodeComponent';
import { LabelNodeComponent } from './LabelNodeComponent';
import { ForkNodeComponent } from './ForkNodeComponent';
import { LoopNodeComponent } from './LoopNodeComponent';
import { SwitchNodeComponent } from './SwitchNodeComponent';
import { JunctionNodeComponent } from './JunctionNodeComponent';
import { IteratorNodeComponent } from './IteratorNodeComponent';

const nodeTypes = {
  workflow: WorkflowNodeComponent,
  label:    LabelNodeComponent,
  fork:     ForkNodeComponent,
  loop:     LoopNodeComponent,
  iterator: IteratorNodeComponent,
  switch:   SwitchNodeComponent,
  junction: JunctionNodeComponent,
};

const RF_TYPE: Record<string, string> = { label: 'label', fork: 'fork', loop: 'loop', iterator: 'iterator', switch: 'switch', junction: 'junction' };

const GRID = 16;
const HALF = GRID / 2;           // 8 — half-grid snap interval
const JUNCTION_R = 9;            // half of the 18px circle; center offset from ReactFlow position

const snap16      = (pos: { x: number; y: number }) => ({ x: Math.round(pos.x / GRID) * GRID, y: Math.round(pos.y / GRID) * GRID });
// Snap the circle's CENTER (pos + radius) to the 8-px grid, then convert back to top-left.
// This ensures the junction handle lands on the same grid as node handles (node center = nodeY + 24 with min-height 48).
const snapJunction = (pos: { x: number; y: number }) => ({
  x: Math.round((pos.x + JUNCTION_R) / HALF) * HALF - JUNCTION_R,
  y: Math.round((pos.y + JUNCTION_R) / HALF) * HALF - JUNCTION_R,
});

const toRFNode = (
  n: WorkflowNode,
  activeIds: Set<string>,
  results: Record<string, { status: string; startedAt?: number; finishedAt?: number }>,
  direction: LayoutDirection,
  entrypoints: Set<string>,
  loopBodyEntries: Set<string>,
  showTiming: boolean,
  onToggleEnabled: () => void,
): Node => {
  if (n.type === 'label') {
    return { id: n.id, type: 'label', position: n.position, data: { config: n.config } };
  }
  if (n.type === 'junction') {
    return {
      id: n.id, type: 'junction', position: n.position,
      data: {
        status:      results[n.id]?.status ?? 'idle',
        isActive:    activeIds.has(n.id),
        orientation: (n.config.orientation as string) ?? 'vertical',
      },
    };
  }
  const r = results[n.id];
  const enabled = n.enabled !== false;
  return {
    id: n.id,
    type: RF_TYPE[n.type] ?? 'workflow',
    position: n.position,
    data: {
      label:            n.name,
      nodeType:         n.type,
      nodeDescription:  n.description,
      status:           r?.status ?? 'idle',
      isActive:         activeIds.has(n.id),
      isEntrypoint:     entrypoints.has(n.id),
      isLoopEntry:      loopBodyEntries.has(n.id),
      direction,
      showTiming,
      startedAt:        r?.startedAt  ?? 0,
      finishedAt:       r?.finishedAt ?? 0,
      enabled,
      onToggleEnabled,
    },
  };
};

const toRFEdge = (e: WorkflowEdge, selected: boolean): Edge => {
  const isBack  = e.fromHandle === 'loop' || e.fromHandle === 'iterator';
  const isFork  = e.fromHandle === 'true' || e.fromHandle === 'false';
  const isTrue  = e.fromHandle === 'true';
  const label   = e.condition ?? (isFork ? (isTrue ? 'T' : 'F') : undefined);
  return {
    id:           e.id,
    source:       e.from,
    target:       e.to,
    sourceHandle: e.fromHandle ?? null,
    selected,
    label,
    animated:     true,
    style: selected
      ? { stroke: '#388bfd', strokeWidth: 2.5, fill: 'none' }
      : isBack
        ? { stroke: '#7a78ff', strokeDasharray: '6 3', strokeWidth: 1 }
        : { stroke: '#b1b1b7', strokeWidth: 1, fill: 'none' },
    labelStyle:   isFork ? { fill: isTrue ? 'var(--green)' : 'var(--red)', fontSize: 10, fontWeight: 700 } : undefined,
    labelBgStyle: isFork ? { fill: 'var(--bg)', fillOpacity: 1 } : undefined,
  };
};

type Clipboard = { nodes: WorkflowNode[]; edges: WorkflowEdge[] };

type Props = {
  onSelectionChange: (ids: string[]) => void;
  layoutDirection: LayoutDirection;
  /** Read-only run-review mode — nodes/edges can be selected & inspected but not edited. */
  reviewing?: boolean;
};

const DRAG_TYPE = 'application/reactflow-node-type';

// Module-level clipboard persists across workflow switches and Canvas remounts
let moduleClipboard: Clipboard = { nodes: [], edges: [] };

export const Canvas = ({ onSelectionChange, layoutDirection, reviewing = false }: Props) => {
  const showNodeTiming   = useSettingsStore((s) => s.showNodeTiming);
  const activeWorkflowId = useWorkflowStore((s) => s.activeWorkflowId);
  const wfNodes        = useWorkflowStore((s) => s.workflows.find((w) => w.id === s.activeWorkflowId)?.nodes ?? []);
  const wfEdges        = useWorkflowStore((s) => s.workflows.find((w) => w.id === s.activeWorkflowId)?.edges ?? []);
  const execution      = useWorkflowStore((s) => s.execution);
  const snapshotHistory = useWorkflowStore((s) => s.snapshotHistory);
  const moveNodeSilent  = useWorkflowStore((s) => s.moveNodeSilent);
  const removeNode      = useWorkflowStore((s) => s.removeNode);
  const addEdge         = useWorkflowStore((s) => s.addEdge);
  const removeEdge      = useWorkflowStore((s) => s.removeEdge);
  const addNode         = useWorkflowStore((s) => s.addNode);
  const addNodes            = useWorkflowStore((s) => s.addNodes);
  const updateNodeSilent    = useWorkflowStore((s) => s.updateNodeSilent);
  const updateNode          = useWorkflowStore((s) => s.updateNode);
  const undo                = useWorkflowStore((s) => s.undo);
  const redo                = useWorkflowStore((s) => s.redo);
  const saveWorkflows   = useWorkflowStore((s) => s.saveWorkflows);
  const focusedNodeId   = useWorkflowStore((s) => s.focusedNodeId);
  const focusNode       = useWorkflowStore((s) => s.focusNode);

  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
  const rfInstanceRef = useRef<ReactFlowInstance | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<Set<string>>(new Set());
  // IDs of nodes that should become selected once they land in wfNodes
  const [pendingSelectIds, setPendingSelectIds] = useState<Set<string> | null>(null);

  // Custom right-drag selection rectangle
  const containerRef = useRef<HTMLDivElement>(null);
  const [selBox, setSelBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // Track which nodes are mid-drag (to snapshot history only once per drag gesture)
  const draggingNodes = useRef<Set<string>>(new Set());

  // Stable refs for the keyboard handler — avoids re-registering the listener
  const selectedIdsRef = useRef(selectedIds);
  const wfNodesRef     = useRef(wfNodes);
  const wfEdgesRef     = useRef(wfEdges);
  const reviewingRef   = useRef(reviewing);
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);
  useEffect(() => { wfNodesRef.current     = wfNodes;     }, [wfNodes]);
  useEffect(() => { wfEdgesRef.current     = wfEdges;     }, [wfEdges]);
  useEffect(() => { reviewingRef.current   = reviewing;   }, [reviewing]);

  // Broadcast selection to parent whenever it changes
  useEffect(() => { onSelectionChange([...selectedIds]); }, [selectedIds, onSelectionChange]);

  // Clear selection when the active workflow changes
  useEffect(() => { setSelectedIds(new Set()); setSelectedEdgeIds(new Set()); }, [activeWorkflowId]);

  // Focus a node programmatically (e.g. from a log-line click)
  useEffect(() => {
    if (!focusedNodeId || !rfInstance) return;
    // Only pan/zoom if the node still exists on the canvas — fitView on a missing
    // id is a no-op that looks broken. Selection still applies so the config panel
    // can surface a removed node's recorded execution results.
    if (rfInstance.getNode(focusedNodeId)) {
      rfInstance.fitView({ nodes: [{ id: focusedNodeId }], duration: 400, padding: 0.8 });
    }
    setSelectedIds(new Set([focusedNodeId]));
    focusNode(null);
  }, [focusedNodeId, rfInstance, focusNode]);

  // Apply deferred selection once pasted nodes are confirmed in the store
  useEffect(() => {
    if (!pendingSelectIds) return;
    const allPresent = [...pendingSelectIds].every((id) => wfNodes.some((n) => n.id === id));
    if (!allPresent) return;
    setSelectedIds(pendingSelectIds);
    setPendingSelectIds(null);
  }, [wfNodes, pendingSelectIds]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const isEditable = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      (t.closest('.monaco-editor') != null ||
       t.matches('input,textarea,select,[contenteditable]'));

    const onKeyDown = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+S works everywhere — swallow the browser dialog even in review mode,
      // but don't persist while reviewing (the canvas is read-only there).
      if (ctrl && e.key === 's') { e.preventDefault(); if (!reviewingRef.current) saveWorkflows(); return; }

      if (isEditable(e.target) || isEditable(document.activeElement)) return;

      // In run-review mode the canvas is read-only: allow only Escape (deselect)
      // and Ctrl+C (copy is harmless — it writes to the module clipboard, not the graph).
      if (reviewingRef.current) {
        if (e.key === 'Escape') setSelectedIds(new Set());
        return;
      }

      if (ctrl && e.key === 'z') { e.preventDefault(); undo(); return; }
      if (ctrl && e.key === 'r') { e.preventDefault(); redo(); return; }

      if (ctrl && e.key === 'c') {
        const nodes = wfNodesRef.current.filter((n) => selectedIdsRef.current.has(n.id));
        if (!nodes.length) return;
        const ids = new Set(nodes.map((n) => n.id));
        const edges = wfEdgesRef.current.filter((e) => ids.has(e.from) && ids.has(e.to));
        moduleClipboard = { nodes, edges };
        return;
      }

      if (ctrl && e.key === 'v') {
        const { nodes, edges } = moduleClipboard;
        if (!nodes.length) return;

        // All-or-nothing: abort if any node fails validation
        for (const n of nodes) {
          const def = getNode(n.type);
          if (!def) return;
          if (!(def.configSchema as ZodSchema).safeParse(n.config).success) return;
        }

        // Remap IDs so pasted nodes are independent copies
        const idMap = new Map(nodes.map((n) => [n.id, crypto.randomUUID()]));
        const newNodes: WorkflowNode[] = nodes.map((n) => ({
          ...n,
          id: idMap.get(n.id)!,
          position: { x: n.position.x + 24, y: n.position.y + 24 },
        }));
        const origIds = new Set(nodes.map((n) => n.id));
        const newEdges: WorkflowEdge[] = edges
          .filter((e) => origIds.has(e.from) && origIds.has(e.to))
          .map((e) => ({
            id:         crypto.randomUUID(),
            from:       idMap.get(e.from)!,
            to:         idMap.get(e.to)!,
            condition:  e.condition,
            fromHandle: e.fromHandle,
          }));

        addNodes(newNodes, newEdges);
        // Defer selection until the new nodes are confirmed in wfNodes
        setPendingSelectIds(new Set(newNodes.map((n) => n.id)));
        return;
      }

      if (e.key === 'r' || e.key === 'R') {
        if (selectedIdsRef.current.size === 1) {
          const [id] = selectedIdsRef.current;
          const node = wfNodesRef.current.find((n) => n.id === id);
          if (node?.type === 'junction') {
            const next = (node.config.orientation as string) === 'horizontal' ? 'vertical' : 'horizontal';
            updateNodeSilent(id, { config: { ...node.config, orientation: next } });
          }
        }
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        selectedIdsRef.current.forEach((id) => removeNode(id));
        setSelectedIds(new Set());
        return;
      }

      if (e.key === 'Escape') {
        setSelectedIds(new Set());
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, redo, saveWorkflows, addNodes, removeNode, updateNodeSilent]);

  // ── Derived node/edge lists ────────────────────────────────────────────────
  const baseNodes = useMemo(() => {
    const backEdges = wfEdges.filter((e) => e.fromHandle === 'loop' || e.fromHandle === 'iterator');

    // For each loop/iterator back-edge, walk forward from its target until reaching
    // the loop/iterator node, collecting all nodes in the body (excluding the controller itself).
    const loopBodyNodes = new Set<string>();
    for (const back of backEdges) {
      const stack = [back.to];
      while (stack.length > 0) {
        const id = stack.pop()!;
        if (loopBodyNodes.has(id) || id === back.from) continue;
        loopBodyNodes.add(id);
        for (const e of wfEdges) {
          if (e.fromHandle !== 'loop' && e.fromHandle !== 'iterator' && e.from === id && !loopBodyNodes.has(e.to)) {
            stack.push(e.to);
          }
        }
      }
    }

    const hasIncoming = new Set(wfEdges.filter((e) => e.fromHandle !== 'loop' && e.fromHandle !== 'iterator').map((e) => e.to));
    const entrypoints = new Set(
      wfNodes.filter((n) => n.type !== 'label' && n.type !== 'junction' && !hasIncoming.has(n.id) && !loopBodyNodes.has(n.id)).map((n) => n.id),
    );
    const activeIds = new Set(execution.activeNodeIds);
    return wfNodes.map((n) => toRFNode(
      n, activeIds, execution.results, layoutDirection, entrypoints, loopBodyNodes, showNodeTiming,
      () => { if (!reviewing) updateNode(n.id, { enabled: n.enabled !== false ? false : true }); },
    ));
  }, [wfNodes, wfEdges, execution.activeNodeIds, execution.results, layoutDirection, showNodeTiming, updateNode, reviewing]);

  const nodes = useMemo(
    () => baseNodes.map((n) => ({ ...n, selected: selectedIds.has(n.id) })),
    [baseNodes, selectedIds],
  );

  const edges = useMemo(
    () => wfEdges.map((e) => toRFEdge(e, selectedEdgeIds.has(e.id))),
    [wfEdges, selectedEdgeIds],
  );

  // ── React Flow handlers ────────────────────────────────────────────────────
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const selectChanges = changes.filter(
        (c): c is NodeChange & { type: 'select'; id: string; selected: boolean } =>
          c.type === 'select',
      );

      if (selectChanges.length > 0) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          selectChanges.forEach((c) => (c.selected ? next.add(c.id) : next.delete(c.id)));
          return next;
        });
        if (selectChanges.some((c) => c.selected)) setSelectedEdgeIds(new Set());
      }

      // Review mode is read-only — accept selection changes (handled above) but
      // ignore any structural edits ReactFlow may emit (drag/remove).
      if (reviewing) return;

      for (const change of changes) {
        if (change.type === 'position' && change.position) {
          const isJunction = wfNodesRef.current.find((n) => n.id === change.id)?.type === 'junction';
          const snapped = isJunction ? snapJunction(change.position) : snap16(change.position);
          if (change.dragging) {
            if (!draggingNodes.current.has(change.id)) {
              // Snapshot exactly once per drag gesture (before the first move of any node)
              if (draggingNodes.current.size === 0) snapshotHistory();
              draggingNodes.current.add(change.id);
            }
            moveNodeSilent(change.id, snapped);
          } else {
            draggingNodes.current.delete(change.id);
            moveNodeSilent(change.id, snapped);
          }
        }
        if (change.type === 'remove') removeNode(change.id);
      }
    },
    [snapshotHistory, moveNodeSilent, removeNode, reviewing],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      for (const change of changes) {
        if (change.type === 'remove') removeEdge(change.id);
        if (change.type === 'select') {
          const isSelected = (change as { selected?: boolean }).selected;
          if (isSelected) {
            // Replace — don't accumulate — because ReactFlow may skip the deselect
            // event for the previously selected edge when a new one is clicked.
            setSelectedEdgeIds(new Set([change.id]));
            setSelectedIds(new Set());
          } else {
            setSelectedEdgeIds((prev) => {
              const next = new Set(prev);
              next.delete(change.id);
              return next;
            });
          }
        }
      }
    },
    [removeEdge],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (reviewing) return;
      addEdge({
        id:         crypto.randomUUID(),
        from:       connection.source!,
        to:         connection.target!,
        condition:  undefined,
        fromHandle: connection.sourceHandle ?? undefined,
      });
    },
    [addEdge, reviewing],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (reviewing) return;
    if (e.dataTransfer.types.includes(DRAG_TYPE)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, [reviewing]);

  const onPaneClick = useCallback(() => {
    setSelectedIds(new Set());
    setSelectedEdgeIds(new Set());
  }, []);

  // Right-drag → custom selection rectangle (React Flow hardcodes selection to button 0)
  const onContainerMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 2) return;
    e.preventDefault();
    const start = { sx: e.clientX, sy: e.clientY };
    let dragging = false;

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - start.sx;
      const dy = ev.clientY - start.sy;
      if (!dragging && Math.hypot(dx, dy) < 4) return;
      dragging = true;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setSelBox({
        x: Math.min(ev.clientX, start.sx) - rect.left,
        y: Math.min(ev.clientY, start.sy) - rect.top,
        w: Math.abs(dx),
        h: Math.abs(dy),
      });
    };

    const onUp = (ev: MouseEvent) => {
      if (ev.button !== 2) return;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (dragging && rfInstanceRef.current) {
        const rf  = rfInstanceRef.current;
        const s   = rf.screenToFlowPosition({ x: start.sx, y: start.sy });
        const end = rf.screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
        const minX = Math.min(s.x, end.x), maxX = Math.max(s.x, end.x);
        const minY = Math.min(s.y, end.y), maxY = Math.max(s.y, end.y);
        const hits = rf.getNodes().filter((n) => {
          const nw = n.width  ?? 160;
          const nh = n.height ?? 56;
          return n.position.x < maxX && n.position.x + nw > minX &&
                 n.position.y < maxY && n.position.y + nh > minY;
        });
        setSelectedIds(new Set(hits.map((n) => n.id)));
      }
      setSelBox(null);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (reviewing) return;
      const type = e.dataTransfer.getData(DRAG_TYPE);
      if (!type || !rfInstance) return;
      const def = getNode(type);
      if (!def) return;
      const raw      = rfInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const position = type === 'junction' ? snapJunction(raw) : snap16(raw);
      addNode({ id: crypto.randomUUID(), type, config: { ...def.defaultConfig }, position });
    },
    [rfInstance, addNode, reviewing],
  );

  return (
    <div
      className="fill"
      ref={containerRef}
      onMouseDown={onContainerMouseDown}
      onContextMenu={(e) => e.preventDefault()}
      style={{ position: 'relative' }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onInit={(instance) => { setRfInstance(instance); rfInstanceRef.current = instance; }}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onPaneClick={onPaneClick}
        nodesDraggable={!reviewing}
        nodesConnectable={!reviewing}
        deleteKeyCode={reviewing ? null : undefined}
        multiSelectionKeyCode="Control"
        selectionKeyCode={null}
        selectionOnDrag={false}
        panOnDrag={[0, 1]}
        proOptions={{ hideAttribution: true }}
        fitView
      >
        <Background variant={BackgroundVariant.Dots} gap={16} color="#484f58" />
        <Controls position="top-left" />
      </ReactFlow>
      {selBox && (
        <div
          className="canvas-sel-rect"
          style={{ left: selBox.x, top: selBox.y, width: selBox.w, height: selBox.h }}
        />
      )}
    </div>
  );
};
