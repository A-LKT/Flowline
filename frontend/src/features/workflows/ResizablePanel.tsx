import { useState, useRef, useCallback, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from 'lucide-react';

const COLLAPSED_PX = 20;

type Props = {
  side:                'left' | 'right' | 'bottom';
  defaultWidth?:       number;
  minWidth?:           number;
  maxWidth?:           number;
  defaultHeight?:      number;
  minHeight?:          number;
  maxHeight?:          number;
  storageKey?:         string;
  collapsed?:          boolean;
  onCollapsedChange?:  (collapsed: boolean) => void;
  locked?:             boolean;
  children:            React.ReactNode;
};

export const ResizablePanel = ({
  side,
  defaultWidth  = 220,
  minWidth      = 140,
  maxWidth      = 560,
  defaultHeight = 220,
  minHeight     = 60,
  maxHeight     = 600,
  storageKey,
  collapsed:       collapsedProp,
  onCollapsedChange,
  locked = false,
  children,
}: Props) => {
  const isLeft   = side === 'left';
  const isBottom = side === 'bottom';
  const defaultSize = isBottom ? defaultHeight : defaultWidth;
  const minSize     = isBottom ? minHeight     : minWidth;
  const maxSize     = isBottom ? maxHeight     : maxWidth;

  const isControlled = collapsedProp !== undefined;

  const [size, setSize] = useState<number>(() => {
    if (storageKey) {
      const v = localStorage.getItem(storageKey);
      if (v) return Number(v);
    }
    return defaultSize;
  });

  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const collapsed = isControlled ? collapsedProp! : internalCollapsed;
  const prevSizeRef    = useRef(size);
  const prevControlRef = useRef(collapsedProp);

  // Sync size transitions when controlled collapsed prop changes externally
  useEffect(() => {
    if (!isControlled) return;
    if (prevControlRef.current === collapsedProp) return;
    prevControlRef.current = collapsedProp;
    if (collapsedProp) {
      prevSizeRef.current = size;
    } else {
      setSize(prevSizeRef.current);
    }
  }, [collapsedProp, isControlled]);

  useEffect(() => {
    if (storageKey && !collapsed) localStorage.setItem(storageKey, String(size));
  }, [size, storageKey, collapsed]);

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startPos  = isBottom ? e.clientY : e.clientX;
      const startSize = size;

      const onMove = (ev: MouseEvent) => {
        const delta = isBottom
          ? startPos - ev.clientY          // drag up  → taller
          : isLeft
          ? ev.clientX - startPos          // drag right → wider (left panel)
          : startPos - ev.clientX;         // drag left  → wider (right panel)
        setSize(Math.max(minSize, Math.min(maxSize, startSize + delta)));
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [isLeft, isBottom, minSize, maxSize, size],
  );

  const toggle = useCallback(() => {
    const next = !collapsed;
    if (isControlled) {
      if (!next) setSize(prevSizeRef.current);
      else prevSizeRef.current = size;
      onCollapsedChange?.(next);
    } else {
      if (collapsed) {
        setInternalCollapsed(false);
        setSize(prevSizeRef.current);
      } else {
        prevSizeRef.current = size;
        setInternalCollapsed(true);
      }
    }
  }, [collapsed, isControlled, onCollapsedChange, size]);

  const Icon = isBottom
    ? (collapsed ? ChevronUp   : ChevronDown)
    : collapsed
    ? (isLeft    ? ChevronRight : ChevronLeft)
    :              (isLeft ? ChevronLeft : ChevronRight);

  const style = isBottom
    ? { height: collapsed ? COLLAPSED_PX : size }
    : { width:  collapsed ? COLLAPSED_PX : size };

  return (
    <div
      className="rp"
      data-side={side}
      data-collapsed={collapsed ? 'true' : undefined}
      style={style}
    >
      {!collapsed && (
        <div
          className={`rp-drag rp-drag--${side}`}
          onMouseDown={onDragStart}
        />
      )}

      <div className="rp-body" aria-hidden={collapsed ? 'true' : undefined}>
        {children}
      </div>

      {!locked && (
        <button
          className={`rp-btn rp-btn--${side}`}
          onClick={toggle}
          title={collapsed ? 'Expand panel' : 'Collapse panel'}
        >
          <Icon size={11} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
};
