import React from 'react';
import type { TableModel, TicketCategory, ObjectType } from '../types';
import { UI_TEXT } from '../constants/uiText';

const OBJECT_TYPE_LABELS: Record<string, string> = {
  table: 'Стол (бронируемый)',
  stage: 'Сцена',
  bar: 'Бар',
  wall: 'Стена',
  passage: 'Проход',
  other: 'Прочее',
};

type Props = {
  table: TableModel | null;
  ticketCategories: TicketCategory[];
  onUpdate: (updates: Partial<TableModel>) => void;
  onDelete: () => void;
  onClose: () => void;
};

const FIELD = 'w-full border border-white/20 rounded-lg px-3 py-2 bg-[#1a1a1a] text-white';
const LABEL = 'block text-xs text-white/60 mb-1';

/** How far one tap of the nudge pad moves the object, in percent of the plan. */
const NUDGE_STEPS = [0.2, 1, 5] as const;

export default function TableEditPanel({ table, ticketCategories, onUpdate, onDelete, onClose }: Props) {
  const [showMore, setShowMore] = React.useState(false);
  const [step, setStep] = React.useState<number>(1);

  React.useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  if (!table) return null;

  const objType = (table.objectType ?? 'table') as string;
  const isDecorative = objType !== 'table';
  const category = ticketCategories.find((c) => c.id === table.categoryId);
  const price = category?.price ?? 0;

  const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v * 100) / 100));
  const nudge = (dx: number, dy: number) => {
    onUpdate({
      centerXPercent: clamp(table.centerXPercent + dx * step),
      centerYPercent: clamp(table.centerYPercent + dy * step),
    });
  };

  return (
    <div
      /*
        A phone and a desktop need different containers for the same contents.

        On a phone this used to be a 300px drawer from the right: three quarters
        of the screen, covering the plan — so the nudge arrows moved a table you
        could not see. Now it is a bottom sheet over the lower half, and the
        admin scrolls the plan to the top when a table is selected.

        From 640px up it stays a side panel, where there is room beside the plan.
      */
      className={[
        'fixed z-[60] flex flex-col bg-[#0f0f0f] shadow-[0_-8px_24px_rgba(0,0,0,0.5)]',
        'inset-x-0 bottom-0 max-h-[48vh] rounded-t-2xl border-t border-[#C6A75E]/30',
        'sm:inset-x-auto sm:right-0 sm:top-0 sm:bottom-0 sm:max-h-none sm:w-[320px]',
        'sm:rounded-none sm:border-t-0 sm:border-l sm:shadow-[-8px_0_24px_rgba(0,0,0,0.5)]',
      ].join(' ')}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Grab handle: says "this is a sheet" on a phone. */}
      <div className="sm:hidden flex justify-center pt-2" aria-hidden>
        <span className="h-1 w-10 rounded-full bg-white/20" />
      </div>
      <div className="px-4 py-2 sm:p-4 border-b border-white/10 flex items-center justify-between">
        <h3 className="font-semibold text-white">{isDecorative ? 'Объект' : `Стол ${table.number}`}</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-white/50 hover:text-white text-2xl leading-none px-2 py-1 rounded hover:bg-white/10 transition-colors"
          aria-label="Закрыть (Esc)"
          title="Закрыть (Esc)"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ---- Position ------------------------------------------------ */}
        {/*
          The hall is arranged on a phone, inside Telegram. A finger cannot drag
          a 14px table to a tenth of a percent, but it can tap a button. The pad
          is the primary way to correct what detection got almost right; the
          numbers below stay for anyone who knows exactly where a table belongs.
        */}
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-xs font-medium text-white/80">{UI_TEXT.tables.positionSection}</span>
            <span className="text-[11px] text-white/40 tabular-nums">
              {table.centerXPercent.toFixed(1)} · {table.centerYPercent.toFixed(1)}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="grid grid-cols-3 grid-rows-3 gap-1 w-[132px] shrink-0">
              <span />
              <button type="button" aria-label="Вверх" onClick={() => nudge(0, -1)} className="h-11 rounded-lg border border-white/15 text-white/80 active:bg-white/10">↑</button>
              <span />
              <button type="button" aria-label="Влево" onClick={() => nudge(-1, 0)} className="h-11 rounded-lg border border-white/15 text-white/80 active:bg-white/10">←</button>
              <span className="h-11 rounded-lg bg-white/5 flex items-center justify-center text-[10px] text-white/40">{step}%</span>
              <button type="button" aria-label="Вправо" onClick={() => nudge(1, 0)} className="h-11 rounded-lg border border-white/15 text-white/80 active:bg-white/10">→</button>
              <span />
              <button type="button" aria-label="Вниз" onClick={() => nudge(0, 1)} className="h-11 rounded-lg border border-white/15 text-white/80 active:bg-white/10">↓</button>
              <span />
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-white/40">Шаг</span>
              {NUDGE_STEPS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStep(s)}
                  aria-pressed={step === s}
                  className={`px-2 py-1.5 rounded-lg text-xs border ${
                    step === s ? 'border-[#C6A75E] text-[#C6A75E]' : 'border-white/15 text-white/60'
                  }`}
                >
                  {s}%
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ---- The three things that actually change per event ---------- */}
        {isDecorative ? (
          <div>
            <label className={LABEL}>Метка</label>
            <input
              type="text"
              value={table.label ?? ''}
              placeholder="Например: Сцена, Бар..."
              onChange={(e) => onUpdate({ label: e.target.value || undefined })}
              className={FIELD}
            />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>{UI_TEXT.tables.tableNumber}</label>
                <input
                  type="number"
                  min={1}
                  value={table.number ?? 1}
                  onChange={(e) => onUpdate({ number: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                  className={FIELD}
                />
              </div>
              <div>
                <label className={LABEL}>{UI_TEXT.tables.seats}</label>
                <input
                  type="number"
                  min={0}
                  value={table.seatsCount}
                  onChange={(e) => {
                    const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                    onUpdate({ seatsCount: val, seatsAvailable: val });
                  }}
                  className={FIELD}
                />
              </div>
            </div>

            <div>
              <label className={LABEL}>Категория</label>
              <select
                value={table.categoryId}
                onChange={(e) => onUpdate({ categoryId: e.target.value || '' })}
                className={FIELD}
              >
                <option value="">—</option>
                {ticketCategories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.price} ₽)</option>
                ))}
              </select>
              <p className="text-[10px] text-white/40 mt-1">
                {price > 0 ? `Цена ${price} ₽ — из категории` : 'Цена задаётся в категории'}
              </p>
            </div>
          </>
        )}

        {/* ---- Everything set once when the hall is built --------------- */}
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          aria-expanded={showMore}
          className="w-full text-left text-xs text-white/50 hover:text-white/80 py-2 border-t border-white/10"
        >
          {showMore ? '− Свернуть' : '+ Ещё'} — форма, размер, поворот, видимость
        </button>

        {showMore && (
          <div className="space-y-4">
            <div>
              <label className={LABEL}>Тип объекта</label>
              <select
                value={objType}
                onChange={(e) => onUpdate({ objectType: e.target.value as ObjectType })}
                className={FIELD}
              >
                {Object.entries(OBJECT_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={LABEL}>{UI_TEXT.tables.shape}</label>
              <select
                value={table.shape}
                onChange={(e) => {
                  const newShape = e.target.value as 'circle' | 'rect';
                  const size = table.shape === 'circle'
                    ? table.widthPercent
                    : Math.min(table.widthPercent, table.heightPercent);
                  onUpdate({ shape: newShape, widthPercent: size, heightPercent: size });
                }}
                className={FIELD}
              >
                <option value="circle">{UI_TEXT.tables.shapeCircle}</option>
                <option value="rect">{UI_TEXT.tables.shapeRect}</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>{UI_TEXT.tables.widthPercent}</label>
                <input
                  type="number"
                  min={2}
                  max={25}
                  step={0.5}
                  value={table.widthPercent}
                  onChange={(e) => {
                    const val = Math.max(2, Math.min(25, parseFloat(e.target.value) || 6));
                    // A circle is square; an ellipse needs the height field below.
                    onUpdate(table.shape === 'circle'
                      ? { widthPercent: val, heightPercent: val }
                      : { widthPercent: val });
                  }}
                  className={FIELD}
                />
              </div>
              <div>
                <label className={LABEL}>{UI_TEXT.tables.heightPercent}</label>
                <input
                  type="number"
                  min={2}
                  max={25}
                  step={0.5}
                  value={table.heightPercent}
                  disabled={table.shape === 'circle'}
                  onChange={(e) => {
                    const val = Math.max(2, Math.min(25, parseFloat(e.target.value) || 6));
                    onUpdate({ heightPercent: val });
                  }}
                  className={`${FIELD} disabled:opacity-40`}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>{UI_TEXT.tables.positionX}</label>
                <input
                  type="number" min={0} max={100} step={0.1}
                  value={table.centerXPercent}
                  onChange={(e) => onUpdate({ centerXPercent: clamp(parseFloat(e.target.value) || 50) })}
                  className={FIELD}
                />
              </div>
              <div>
                <label className={LABEL}>{UI_TEXT.tables.positionY}</label>
                <input
                  type="number" min={0} max={100} step={0.1}
                  value={table.centerYPercent}
                  onChange={(e) => onUpdate({ centerYPercent: clamp(parseFloat(e.target.value) || 50) })}
                  className={FIELD}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>{UI_TEXT.tables.rotationDeg}</label>
                <input
                  type="number" min={-180} max={180}
                  value={table.rotationDeg}
                  onChange={(e) => onUpdate({
                    rotationDeg: Math.max(-180, Math.min(180, parseInt(e.target.value, 10) || 0)),
                  })}
                  className={FIELD}
                />
              </div>
              <div>
                <label className={LABEL}>{UI_TEXT.tables.labelFontSize}</label>
                <input
                  type="number" min={6} max={48} step={1} placeholder="авто"
                  value={table.labelFontSize ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value;
                    onUpdate({
                      labelFontSize: raw === '' ? undefined : Math.max(6, Math.min(48, parseInt(raw, 10))),
                    });
                  }}
                  className={FIELD}
                />
              </div>
            </div>

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
        )}
      </div>

      <div className="px-4 py-3 border-t border-white/10">
        <button
          type="button"
          onClick={() => onDelete()}
          className="w-full rounded-xl py-2.5 text-sm text-[#ff6b61] border border-[#ff3b30]/40"
        >
          {isDecorative ? 'Удалить объект' : 'Удалить стол'}
        </button>
      </div>
    </div>
  );
}
