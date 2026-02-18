import React from 'react';
import type { TableModel, TicketCategory } from '../types';
import { UI_TEXT } from '../constants/uiText';
import DangerButton from '../src/ui/DangerButton';

type Props = {
  table: TableModel | null;
  ticketCategories: TicketCategory[];
  onUpdate: (updates: Partial<TableModel>) => void;
  onDelete: () => void;
  onClose: () => void;
};

export default function TableEditPanel({ table, ticketCategories, onUpdate, onDelete, onClose }: Props) {
  if (!table) return null;

  const category = ticketCategories.find((c) => c.id === table.categoryId);
  const price = category?.price ?? 0;

  return (
    <div
      className="fixed right-0 top-0 h-full w-[300px] bg-[#0f0f0f] border-l border-[#C6A75E]/30 shadow-[-8px_0_24px_rgba(0,0,0,0.5)] z-40 flex flex-col animate-slide-in-right"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="p-4 border-b border-white/10 flex items-center justify-between">
        <h3 className="font-semibold text-white">Редактирование стола</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-white/60 hover:text-white text-2xl leading-none"
          aria-label="Закрыть"
        >
          ×
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <label className="block text-xs text-white/60 mb-1">{UI_TEXT.tables.tableNumber}</label>
          <input
            type="number"
            min={1}
            value={table.number ?? 1}
            onChange={(e) => {
              const val = Math.max(1, parseInt(e.target.value, 10) || 1);
              onUpdate({ number: val });
            }}
            className="w-full border border-white/20 rounded-lg px-3 py-2 bg-[#1a1a1a] text-white"
          />
        </div>
        <div>
          <label className="block text-xs text-white/60 mb-1">{UI_TEXT.tables.seats}</label>
          <input
            type="number"
            min={0}
            value={table.seatsCount}
            onChange={(e) => {
              const val = Math.max(0, parseInt(e.target.value, 10) || 0);
              onUpdate({ seatsCount: val });
            }}
            className="w-full border border-white/20 rounded-lg px-3 py-2 bg-[#1a1a1a] text-white"
          />
        </div>
        <div>
          <label className="block text-xs text-white/60 mb-1">Цена (₽)</label>
          <input
            type="text"
            value={price > 0 ? `${price}` : '—'}
            readOnly
            className="w-full border border-white/10 rounded-lg px-3 py-2 bg-[#111] text-white/60"
          />
          <p className="text-[10px] text-white/40 mt-1">Цена задаётся в категории</p>
        </div>
        <div>
          <label className="block text-xs text-white/60 mb-1">Категория</label>
          <select
            value={table.ticketCategoryId ?? ''}
            onChange={(e) => {
              const val = e.target.value || null;
              onUpdate({ ticketCategoryId: val });
            }}
            className="w-full border border-white/20 rounded-lg px-3 py-2 bg-[#1a1a1a] text-white"
          >
            <option value="">—</option>
            {ticketCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.price} ₽)
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-white/60 mb-1">{UI_TEXT.tables.shape}</label>
          <select
            value={table.shape}
            onChange={(e) => {
              const newShape = e.target.value as 'circle' | 'rect';
              const size = table.shape === 'circle' ? table.widthPercent : Math.min(table.widthPercent, table.heightPercent);
              onUpdate({ shape: newShape, widthPercent: size, heightPercent: size });
            }}
            className="w-full border border-white/20 rounded-lg px-3 py-2 bg-[#1a1a1a] text-white"
          >
            <option value="circle">{UI_TEXT.tables.shapeCircle}</option>
            <option value="rect">{UI_TEXT.tables.shapeRect}</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-white/60 mb-1">{UI_TEXT.tables.rotationDeg}</label>
          <input
            type="number"
            min={-180}
            max={180}
            value={table.rotationDeg}
            onChange={(e) => {
              const val = Math.max(-180, Math.min(180, parseInt(e.target.value, 10) || 0));
              onUpdate({ rotationDeg: val });
            }}
            className="w-full border border-white/20 rounded-lg px-3 py-2 bg-[#1a1a1a] text-white"
          />
        </div>
        {table.shape === 'circle' ? (
          <div>
            <label className="block text-xs text-white/60 mb-1">{UI_TEXT.tables.sizePercent}</label>
            <input
              type="number"
              min={2}
              max={25}
              step={0.5}
              value={table.widthPercent}
              onChange={(e) => {
                const val = Math.max(2, Math.min(25, parseFloat(e.target.value) || 6));
                onUpdate({ widthPercent: val, heightPercent: val });
              }}
              className="w-full border border-white/20 rounded-lg px-3 py-2 bg-[#1a1a1a] text-white"
            />
          </div>
        ) : (
          <>
            <div>
              <label className="block text-xs text-white/60 mb-1">{UI_TEXT.tables.widthPercent}</label>
              <input
                type="number"
                min={2}
                max={25}
                step={0.5}
                value={table.widthPercent}
                onChange={(e) => {
                  const val = Math.max(2, Math.min(25, parseFloat(e.target.value) || 6));
                  onUpdate({ widthPercent: val });
                }}
                className="w-full border border-white/20 rounded-lg px-3 py-2 bg-[#1a1a1a] text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-white/60 mb-1">{UI_TEXT.tables.heightPercent}</label>
              <input
                type="number"
                min={2}
                max={25}
                step={0.5}
                value={table.heightPercent}
                onChange={(e) => {
                  const val = Math.max(2, Math.min(25, parseFloat(e.target.value) || 6));
                  onUpdate({ heightPercent: val });
                }}
                className="w-full border border-white/20 rounded-lg px-3 py-2 bg-[#1a1a1a] text-white"
              />
            </div>
          </>
        )}
        <div>
          <label className="flex items-center gap-2 text-sm text-white/80 cursor-pointer">
            <input
              type="checkbox"
              checked={table.isActive}
              onChange={(e) => onUpdate({ isActive: e.target.checked })}
              className="rounded border-white/30"
            />
            {UI_TEXT.tables.available}
          </label>
        </div>
      </div>
      <div className="p-4 border-t border-white/10">
        <DangerButton onClick={onDelete} className="w-full">
          {UI_TEXT.common.delete}
        </DangerButton>
      </div>
    </div>
  );
}
