import { useState, useRef } from 'react';
import { Search, X, Plug } from 'lucide-react';
import { getAllNodes } from '../../engine/nodeRegistry';
import { useWorkflowStore } from '../../state/workflowStore';
import { getCategoryIcon, getNodeIcon } from '../canvas/nodeIcons';
import type { WorkflowNode } from '../../types/workflow';

const DRAG_TYPE = 'application/reactflow-node-type';

export const NodePalette = () => {
  const addNode = useWorkflowStore((s) => s.addNode);
  const nodeDefs = getAllNodes();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const q = query.trim().toLowerCase();

  const filtered = q
    ? nodeDefs.filter(
        (d) =>
          d.label.toLowerCase().includes(q) ||
          d.type.toLowerCase().includes(q) ||
          d.description.toLowerCase().includes(q) ||
          d.category.toLowerCase().includes(q),
      )
    : nodeDefs;

  const byCategory = filtered.reduce<Record<string, typeof nodeDefs>>((acc, def) => {
    if (!acc[def.category]) acc[def.category] = [];
    acc[def.category].push(def);
    return acc;
  }, {});

  const createNode = (type: string): WorkflowNode | null => {
    const def = nodeDefs.find((n) => n.type === type);
    if (!def) return null;
    return {
      id: crypto.randomUUID(),
      type,
      config: { ...def.defaultConfig },
      position: { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 },
    };
  };

  const handleDoubleClick = (type: string) => {
    const node = createNode(type);
    if (node) addNode(node);
  };

  const handleDragStart = (e: React.DragEvent, type: string) => {
    e.dataTransfer.setData(DRAG_TYPE, type);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className="palette">
      {/* Filter input */}
      <div className="palette-search">
        <Search size={12} className="palette-search-icon" strokeWidth={2} />
        <input
          ref={inputRef}
          className="palette-search-input"
          placeholder="Filter nodes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button className="palette-search-clear" onClick={() => { setQuery(''); inputRef.current?.focus(); }}>
            <X size={11} strokeWidth={2} />
          </button>
        )}
      </div>

      <p className="palette-hint">Double-click or drag onto canvas</p>

      {Object.keys(byCategory).length === 0 && (
        <p className="palette-no-results">No nodes match "{query}"</p>
      )}

      {Object.entries(byCategory).map(([category, nodes]) => {
        const CatIcon = getCategoryIcon(category);
        return (
          <div key={category} className="palette-cat-group">
            <p className="palette-category">
              <CatIcon size={11} strokeWidth={2} />
              {category}
            </p>
            {nodes.map((def) => {
              const NodeIcon = getNodeIcon(def.type);
              return (
                <div
                  key={def.type}
                  className="palette-node-btn"
                  data-type={def.type}
                  draggable
                  onDoubleClick={() => handleDoubleClick(def.type)}
                  onDragStart={(e) => handleDragStart(e, def.type)}
                >
                  <div className="palette-node-btn-header">
                    <span className="palette-node-icon" data-type={def.type}>
                      <NodeIcon size={13} strokeWidth={2} />
                    </span>
                    <span className="palette-node-name">{def.label}</span>
                    {def.plugin && (
                      <span className="palette-node-plugin-badge" title={`Plugin: ${def.plugin}`}>
                        <Plug size={10} strokeWidth={2} />
                      </span>
                    )}
                  </div>
                  <p className="palette-node-desc">{def.description}</p>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};
