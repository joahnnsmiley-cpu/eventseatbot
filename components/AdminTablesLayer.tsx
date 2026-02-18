import React, { useCallback, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  useDraggable,
} from '@dnd-kit/core';
import type { Table } from '../types';
import { mapTableFromDb } from '../src/utils/mapTableFromDb';
import { computeTableSizes } from '../src/ui/tableSizing';
import { CATEGORY_COLORS, resolveCategoryColorKey } from '../src/config/categoryColors';
import { TableNumber, SeatInfo } from './TableLabel';
import { UI_TEXT } from '../constants/uiText';

const MIN_SIZE_PERCENT = 2;
const MAX_SIZE_PERCENT = 25;

type TableWithCoords = Table & { centerX: number; centerY: number; widthPercent?: number; heightPercent?: number; sizePercent?: number };

type HandlePos = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

type Props = {
  tables: Table[];
  layoutWidth: number;
  layoutHeight: number;
  ticketCategories: { id: string; name?: string; price?: number }[];
  selectedTableId: string | null;
  onTableSelect: (id: string) => void;
  onTablesChange: (updater: (prev: Table[]) => Table[]) => void;
  onTableDelete?: (id: string) => void;
};

function ResizeHandle({
  position,
  onResizeStart,
}: {
  position: HandlePos;
  onResizeStart: (e: React.PointerEvent) => void;
}) {
  const posClass = {
    'bottom-right': 'bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-se-resize',
    'bottom-left': 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-sw-resize',
    'top-right': 'top-0 right-0 translate-x-1/2 -translate-y-1/2 cursor-ne-resize',
    'top-left': 'top-0 left-0 -translate-x-1/2 -translate-y-1/2 cursor-nw-resize',
  }[position];

  return (
    <div
      className={`absolute w-3 h-3 rounded-full bg-[#C6A75E] border border-[#2A2A2A] opacity-90 hover:opacity-100 z-40 ${posClass}`}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onResizeStart(e);
      }}
      style={{ touchAction: 'none' }}
    />
  );
}

function DraggableTable({
  table,
  layoutWidth,
  layoutHeight,
  ticketCategories,
  isSelected,
  onSelect,
  onDelete,
  onTablesChange,
  containerRef,
}: {
  table: TableWithCoords;
  layoutWidth: number;
  layoutHeight: number;
  ticketCategories: { id: string; name?: string; price?: number }[];
  isSelected: boolean;
  onSelect: () => void;
  onDelete?: () => void;
  onTablesChange: (updater: (prev: Table[]) => Table[]) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const category = ticketCategories.find((c) => c.id === table.ticketCategoryId);
  const palette = category ? CATEGORY_COLORS[resolveCategoryColorKey(category)] : null;
  const sizes = computeTableSizes(layoutWidth, {
    sizePercent: table.sizePercent,
    widthPercent: table.widthPercent,
    heightPercent: table.heightPercent,
  });
  const borderRadius = sizes.borderRadius === '50%' ? '50%' : 12;
  const shapeStyle = {
    width: sizes.width,
    height: sizes.height,
    borderRadius,
    background: palette?.gradient ?? '#2a2a2a',
    border: palette?.border ?? '1.5px solid #3a3a3a',
    boxShadow: palette?.glow ?? 'none',
  };

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: table.id,
  });

  const resizeStateRef = useRef<{
    handle: HandlePos;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    startCenterX: number;
    startCenterY: number;
    startSize: number;
    hasRect: boolean;
  } | null>(null);

  const handleResizeStart = useCallback(
    (e: React.PointerEvent, handle: HandlePos) => {
      e.stopPropagation();
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const mapped = mapTableFromDb(table);
      const hasRect = typeof mapped.widthPercent === 'number' && typeof mapped.heightPercent === 'number';
      const w = hasRect ? mapped.widthPercent! : (mapped.sizePercent ?? 6);
      const h = hasRect ? mapped.heightPercent! : (mapped.sizePercent ?? 6);
      resizeStateRef.current = {
        handle,
        startX: e.clientX,
        startY: e.clientY,
        startWidth: w,
        startHeight: h,
        startCenterX: mapped.centerX ?? 50,
        startCenterY: mapped.centerY ?? 50,
        startSize: mapped.sizePercent ?? 6,
        hasRect,
      };

      const onMove = (ev: PointerEvent) => {
        const state = resizeStateRef.current;
        if (!state || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const deltaXPercent = ((ev.clientX - state.startX) / rect.width) * 100;
        const deltaYPercent = ((ev.clientY - state.startY) / rect.height) * 100;
        const dw = { 'bottom-right': 1, 'bottom-left': -1, 'top-right': 1, 'top-left': -1 }[state.handle] * deltaXPercent;
        const dh = { 'bottom-right': 1, 'bottom-left': 1, 'top-right': -1, 'top-left': -1 }[state.handle] * deltaYPercent;

        if (state.hasRect) {
          const newW = Math.max(MIN_SIZE_PERCENT, Math.min(MAX_SIZE_PERCENT, state.startWidth + dw));
          const newH = Math.max(MIN_SIZE_PERCENT, Math.min(MAX_SIZE_PERCENT, state.startHeight + dh));
          const deltaCx = (state.handle === 'bottom-right' || state.handle === 'top-right' ? 1 : -1) * dw / 2;
          const deltaCy = (state.handle === 'bottom-right' || state.handle === 'bottom-left' ? 1 : -1) * dh / 2;
          const newCx = state.startCenterX + deltaCx;
          const newCy = state.startCenterY + deltaCy;
          onTablesChange((prev) =>
            prev.map((t) => {
              if (t.id !== table.id) return t;
              return { ...t, widthPercent: newW, heightPercent: newH, centerX: newCx, centerY: newCy, x: newCx, y: newCy };
            })
          );
        } else {
          const deltaSize = (dw + dh) / 2;
          const newSize = Math.max(MIN_SIZE_PERCENT, Math.min(MAX_SIZE_PERCENT, state.startSize + deltaSize));
          onTablesChange((prev) =>
            prev.map((t) => {
              if (t.id !== table.id) return t;
              return { ...t, sizePercent: newSize };
            })
          );
        }
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        resizeStateRef.current = null;
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [table, onTablesChange]
  );

  const style: React.CSSProperties = {
    position: 'absolute',
    left: `${table.centerX}%`,
    top: `${table.centerY}%`,
    transform: transform
      ? `translate(calc(-50% + ${transform.x}px), calc(-50% + ${transform.y}px)) rotate(${table.rotationDeg ?? 0}deg)`
      : `translate(-50%, -50%) rotate(${table.rotationDeg ?? 0}deg)`,
    transformOrigin: 'center',
    cursor: isDragging ? 'grabbing' : 'grab',
    opacity: isDragging ? 0.9 : 1,
    zIndex: isSelected ? 20 : 10,
  };

  return (
    <div
      ref={setNodeRef}
      id={`table-${table.id}`}
      className={`table-wrapper ${isSelected ? 'ring-2 ring-[#C6A75E]' : ''}`}
      style={style}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <div className="relative" style={{ width: sizes.width, height: sizes.height }}>
        <div className="table-shape table-shape-gold pointer-events-none" style={shapeStyle} />
        {isSelected && (
          <>
            <ResizeHandle position="bottom-right" onResizeStart={(e) => handleResizeStart(e, 'bottom-right')} />
            <ResizeHandle position="bottom-left" onResizeStart={(e) => handleResizeStart(e, 'bottom-left')} />
            <ResizeHandle position="top-right" onResizeStart={(e) => handleResizeStart(e, 'top-right')} />
            <ResizeHandle position="top-left" onResizeStart={(e) => handleResizeStart(e, 'top-left')} />
          </>
        )}
      </div>
      <div className="table-label pointer-events-none">
        <TableNumber number={table.number ?? 0} fontSize={`${sizes.fontNumber}px`} />
        <SeatInfo available={table.seatsAvailable ?? table.seatsTotal} total={table.seatsTotal ?? 4} fontSize={`${sizes.fontSub}px`} />
      </div>
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute -top-2 -right-2 bg-[#141414] text-[#C6A75E] border border-[#2A2A2A] hover:border-[#C6A75E] rounded-full w-6 h-6 flex items-center justify-center text-xs z-30"
          aria-label={`${UI_TEXT.common.delete} ${UI_TEXT.tables.table} ${table.number}`}
        >
          ×
        </button>
      )}
    </div>
  );
}

export default function AdminTablesLayer({
  tables,
  layoutWidth,
  layoutHeight,
  ticketCategories,
  selectedTableId,
  onTableSelect,
  onTablesChange,
  onTableDelete,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, delta } = e;
    if (!delta.x && !delta.y) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const deltaXPercent = (delta.x / rect.width) * 100;
    const deltaYPercent = (delta.y / rect.height) * 100;

    onTablesChange((prev) =>
      prev.map((t) => {
        if (t.id !== active.id) return t;
        const mapped = mapTableFromDb(t);
        const cx = (mapped.centerX ?? 50) + deltaXPercent;
        const cy = (mapped.centerY ?? 50) + deltaYPercent;
        return {
          ...t,
          centerX: Math.max(0, Math.min(100, cx)),
          centerY: Math.max(0, Math.min(100, cy)),
          x: Math.max(0, Math.min(100, cx)),
          y: Math.max(0, Math.min(100, cy)),
        };
      })
    );
  };

  const mapped = tables.map(mapTableFromDb) as TableWithCoords[];
  const sorted = [...mapped].sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity));

  return (
    <div ref={containerRef} className="absolute inset-0" style={{ pointerEvents: 'auto' }}>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {sorted.map((table) => (
          <DraggableTable
            key={table.id}
            table={table}
            layoutWidth={layoutWidth}
            layoutHeight={layoutHeight}
            ticketCategories={ticketCategories}
            isSelected={selectedTableId === table.id}
            onSelect={() => onTableSelect(table.id)}
            onDelete={onTableDelete ? () => onTableDelete(table.id) : undefined}
            onTablesChange={onTablesChange}
            containerRef={containerRef}
          />
        ))}
      </DndContext>
    </div>
  );
}
