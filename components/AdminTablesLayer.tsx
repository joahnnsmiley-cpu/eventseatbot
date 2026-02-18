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
import type { TableModel } from '../types';
import { getCategoryColorFromCategory } from '../src/config/categoryColors';
import { getTableShapeStyle, getTableLabelStyle } from '../src/utils/tableShapeStyles';
import { TableNumber } from './TableLabel';
import { UI_TEXT } from '../constants/uiText';

const MIN_SIZE_PERCENT = 2;
const MAX_SIZE_PERCENT = 25;

type HandlePos = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

type Props = {
  tables: TableModel[];
  ticketCategories: { id: string; name?: string; price?: number; color_key?: string; styleKey?: string; custom_color?: string }[];
  selectedTableId: string | null;
  onTableSelect: (id: string) => void;
  onTablesChange: (updater: (prev: TableModel[]) => TableModel[]) => void;
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
      className={`absolute w-3 h-3 rounded-full bg-[#C6A75E] border border-[#2A2A2A] z-40 ${posClass}`}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onResizeStart(e);
      }}
      style={{ touchAction: 'none', pointerEvents: 'auto' }}
    />
  );
}

function DraggableTable({
  table,
  ticketCategories,
  isSelected,
  onSelect,
  onTablesChange,
  containerRef,
}: {
  table: TableModel;
  ticketCategories: { id: string; name?: string; price?: number; color_key?: string; styleKey?: string; custom_color?: string }[];
  isSelected: boolean;
  onSelect: () => void;
  onTablesChange: (updater: (prev: TableModel[]) => TableModel[]) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const category = ticketCategories.find((c) => c.id === table.categoryId);
  const palette = category ? getCategoryColorFromCategory(category) : null;
  const wrapperSizeStyle: React.CSSProperties =
    table.shape === 'circle'
      ? { width: `${table.widthPercent}cqw`, height: `${table.widthPercent}cqw` }
      : { width: `${table.widthPercent}%`, height: `${table.heightPercent}%`, borderRadius: 0 };
  const isCircle = table.shape === 'circle';
  const shapeStyle = getTableShapeStyle(palette, isCircle);

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
  } | null>(null);

  const handleResizeStart = useCallback(
    (e: React.PointerEvent, handle: HandlePos) => {
      e.stopPropagation();
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      resizeStateRef.current = {
        handle,
        startX: e.clientX,
        startY: e.clientY,
        startWidth: table.widthPercent,
        startHeight: table.heightPercent,
        startCenterX: table.centerXPercent,
        startCenterY: table.centerYPercent,
      };

      const onMove = (ev: PointerEvent) => {
        const state = resizeStateRef.current;
        if (!state || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const deltaXPercent = ((ev.clientX - state.startX) / rect.width) * 100;
        const deltaYPercent = ((ev.clientY - state.startY) / rect.height) * 100;
        const dw = { 'bottom-right': 1, 'bottom-left': -1, 'top-right': 1, 'top-left': -1 }[state.handle] * deltaXPercent;
        const dh = { 'bottom-right': 1, 'bottom-left': 1, 'top-right': -1, 'top-left': -1 }[state.handle] * deltaYPercent;

        if (table.shape === 'rect') {
          const newW = Math.max(MIN_SIZE_PERCENT, Math.min(MAX_SIZE_PERCENT, state.startWidth + dw));
          const newH = Math.max(MIN_SIZE_PERCENT, Math.min(MAX_SIZE_PERCENT, state.startHeight + dh));
          const deltaCx = (state.handle === 'bottom-right' || state.handle === 'top-right' ? 1 : -1) * dw / 2;
          const deltaCy = (state.handle === 'bottom-right' || state.handle === 'bottom-left' ? 1 : -1) * dh / 2;
          const newCx = state.startCenterX + deltaCx;
          const newCy = state.startCenterY + deltaCy;
          onTablesChange((prev) =>
            prev.map((t) => {
              if (t.id !== table.id) return t;
              return {
                ...t,
                widthPercent: newW,
                heightPercent: newH,
                centerXPercent: newCx,
                centerYPercent: newCy,
                centerX: newCx,
                centerY: newCy,
              };
            })
          );
        } else {
          const deltaSize = (dw + dh) / 2;
          const newWidth = Math.max(MIN_SIZE_PERCENT, Math.min(MAX_SIZE_PERCENT, state.startWidth + deltaSize));
          onTablesChange((prev) =>
            prev.map((t) => {
              if (t.id !== table.id) return t;
              return { ...t, widthPercent: newWidth, sizePercent: newWidth };
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

  const wrapperStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${table.centerXPercent}%`,
    top: `${table.centerYPercent}%`,
    ...wrapperSizeStyle,
    pointerEvents: 'auto',
    transform: transform
      ? `translate(calc(-50% + ${transform.x}px), calc(-50% + ${transform.y}px)) rotate(${table.rotationDeg}deg)`
      : `translate(-50%, -50%) rotate(${table.rotationDeg}deg)`,
    transformOrigin: 'center',
    cursor: isDragging ? 'grabbing' : 'grab',
    zIndex: isSelected ? 20 : 10,
  };

  return (
    <div
      ref={setNodeRef}
      data-table-id={table.id}
      id={`table-${table.id}`}
      className={`table-wrapper ${isCircle ? 'table-wrapper-circle' : ''} ${isSelected ? 'table-selected' : ''}`}
      style={wrapperStyle}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <div className={`table-shape table-shape-gold pointer-events-none ${isCircle ? 'table-shape-circle' : ''}`} style={shapeStyle}>
        <div className="table-overlay">
          <div className="table-label" style={getTableLabelStyle(palette ?? null)}>
            <TableNumber number={table.number ?? 0} />
          </div>
        </div>
        {isSelected && (
          <>
            <ResizeHandle position="bottom-right" onResizeStart={(e) => handleResizeStart(e, 'bottom-right')} />
            <ResizeHandle position="bottom-left" onResizeStart={(e) => handleResizeStart(e, 'bottom-left')} />
            <ResizeHandle position="top-right" onResizeStart={(e) => handleResizeStart(e, 'top-right')} />
            <ResizeHandle position="top-left" onResizeStart={(e) => handleResizeStart(e, 'top-left')} />
          </>
        )}
      </div>
    </div>
  );
}

export default function AdminTablesLayer({
  tables,
  ticketCategories,
  selectedTableId,
  onTableSelect,
  onTablesChange,
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
    if (rect.width <= 0 || rect.height <= 0) return;
    const deltaXPercent = (delta.x / rect.width) * 100;
    const deltaYPercent = (delta.y / rect.height) * 100;

    onTablesChange((prev) =>
      prev.map((t) => {
        if (t.id !== active.id) return t;
        const newX = Math.max(0, Math.min(100, t.centerXPercent + deltaXPercent));
        const newY = Math.max(0, Math.min(100, t.centerYPercent + deltaYPercent));
        return {
          ...t,
          centerXPercent: newX,
          centerYPercent: newY,
          centerX: newX,
          centerY: newY,
        };
      })
    );
  };

  const sorted = [...tables].sort((a, b) => a.number - b.number);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 10,
      }}
    >
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {sorted.map((table) => (
          <DraggableTable
            key={table.id}
            table={table}
            ticketCategories={ticketCategories}
            isSelected={selectedTableId === table.id}
            onSelect={() => onTableSelect(table.id)}
            onTablesChange={onTablesChange}
            containerRef={containerRef}
          />
        ))}
      </DndContext>
    </div>
  );
}
