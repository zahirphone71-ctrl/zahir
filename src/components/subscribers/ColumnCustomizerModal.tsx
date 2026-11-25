import React, { useState } from 'react';
import {
  X,
  SlidersHorizontal,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  CheckSquare,
  Square,
  Sparkles,
  LayoutGrid,
  GripVertical
} from 'lucide-react';
import { TableColumnConfig, TableDensity } from './types';
import { ALL_SUBSCRIBER_COLUMNS } from './tableColumnsConfig';

interface ColumnCustomizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  columnOrder: string[];
  visibleColumns: string[];
  onChangeOrder: (newOrder: string[]) => void;
  onToggleColumn: (columnKey: string) => void;
  onSetAllVisible: (keys: string[]) => void;
  onResetDefaults: () => void;
  density: TableDensity;
  onChangeDensity: (density: TableDensity) => void;
}

export const ColumnCustomizerModal: React.FC<ColumnCustomizerModalProps> = ({
  isOpen,
  onClose,
  columnOrder,
  visibleColumns,
  onChangeOrder,
  onToggleColumn,
  onSetAllVisible,
  onResetDefaults,
  density,
  onChangeDensity
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Drag and Drop state
  const [draggedColKey, setDraggedColKey] = useState<string | null>(null);
  const [dragOverColKey, setDragOverColKey] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'above' | 'below' | null>(null);

  if (!isOpen) return null;

  // Build full list based on current order
  const orderedConfigs: TableColumnConfig[] = columnOrder
    .map((key) => ALL_SUBSCRIBER_COLUMNS.find((c) => c.key === key))
    .filter((c): c is TableColumnConfig => c !== undefined);

  // Add any missing columns from config
  ALL_SUBSCRIBER_COLUMNS.forEach((col) => {
    if (!orderedConfigs.some((c) => c.key === col.key)) {
      orderedConfigs.push(col);
    }
  });

  const filteredConfigs = orderedConfigs.filter(
    (c) =>
      c.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.tooltip && c.tooltip.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const moveColumn = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= orderedConfigs.length) return;

    const newOrder = [...orderedConfigs.map((c) => c.key)];
    const temp = newOrder[index];
    newOrder[index] = newOrder[newIndex];
    newOrder[newIndex] = temp;

    onChangeOrder(newOrder);
  };

  const handleDragStart = (e: React.DragEvent, colKey: string) => {
    setDraggedColKey(colKey);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', colKey);
  };

  const handleDragOver = (e: React.DragEvent, colKey: string) => {
    if (!draggedColKey || draggedColKey === colKey) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position = e.clientY < midY ? 'above' : 'below';

    setDragOverColKey(colKey);
    setDropPosition(position);
  };

  const handleDragLeave = (e: React.DragEvent, colKey: string) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    if (dragOverColKey === colKey) {
      setDragOverColKey(null);
      setDropPosition(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetColKey: string) => {
    e.preventDefault();
    if (!draggedColKey || draggedColKey === targetColKey) {
      setDraggedColKey(null);
      setDragOverColKey(null);
      setDropPosition(null);
      return;
    }

    const newOrder = [...orderedConfigs.map((c) => c.key)];
    const sourceIdx = newOrder.indexOf(draggedColKey);
    if (sourceIdx === -1) return;

    newOrder.splice(sourceIdx, 1);

    const targetIdx = newOrder.indexOf(targetColKey);
    if (targetIdx === -1) return;

    const insertIdx = dropPosition === 'above' ? targetIdx : targetIdx + 1;
    newOrder.splice(insertIdx, 0, draggedColKey);

    onChangeOrder(newOrder);

    setDraggedColKey(null);
    setDragOverColKey(null);
    setDropPosition(null);
  };

  const handleDragEnd = () => {
    setDraggedColKey(null);
    setDragOverColKey(null);
    setDropPosition(null);
  };

  const handleSelectAll = () => {
    onSetAllVisible(ALL_SUBSCRIBER_COLUMNS.map((c) => c.key));
  };

  const handleSelectEssentialOnly = () => {
    const essential = ['username', 'password', 'status', 'deviceType', 'profile', 'remainingTimeAndData'];
    onSetAllVisible(essential);
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[100] flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl space-y-5 text-right animate-in fade-in zoom-in-95 duration-200 my-auto mx-auto max-w-[96vw] sm:max-w-[90vw] md:max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-blue-500/15 border border-blue-500/30 text-blue-400">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">تخصيص أعمدة الجدول والترتيب</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                تحكم في ظهور الأعمدة، ترتيبها، وحجم العرض لجدول المشتركين
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl bg-slate-800 hover:bg-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Density Selector */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <LayoutGrid className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-bold text-slate-200">كثافة وحجم الجدول:</span>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => onChangeDensity('compact')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                density === 'compact'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              مضغوط (Compact)
            </button>
            <button
              type="button"
              onClick={() => onChangeDensity('normal')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                density === 'normal'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              عادي (Normal)
            </button>
            <button
              type="button"
              onClick={() => onChangeDensity('relaxed')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                density === 'relaxed'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              مريح (Spacious)
            </button>
          </div>
        </div>

        {/* Quick Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSelectAll}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold border border-slate-700 transition-colors flex items-center gap-1.5"
            >
              <CheckSquare className="w-3.5 h-3.5 text-blue-400" />
              <span>إظهار الكل ({ALL_SUBSCRIBER_COLUMNS.length})</span>
            </button>
            <button
              type="button"
              onClick={handleSelectEssentialOnly}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold border border-slate-700 transition-colors flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>الأعمدة الأساسية</span>
            </button>
            <button
              type="button"
              onClick={onResetDefaults}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold border border-slate-700 transition-colors flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              <span>إعادة ضبط الافتراضي</span>
            </button>
          </div>
          <span className="text-slate-400 font-mono text-[11px]">
            المحدد: {visibleColumns.length} من {ALL_SUBSCRIBER_COLUMNS.length}
          </span>
        </div>

        {/* Drag and Drop Tip Banner */}
        <div className="bg-blue-950/40 border border-blue-800/40 rounded-2xl px-3.5 py-2.5 flex items-center gap-2.5 text-xs text-blue-300">
          <GripVertical className="w-4 h-4 text-blue-400 shrink-0" />
          <span>
            يمكنك سحب وإفلات أي عمود من خلال مقبض السحب (⠿) لتغيير موضعه وترتيبه يدوياً، أو استخدام الأسهم.
          </span>
        </div>

        {/* Column List with drag/reorder controls */}
        <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
          {filteredConfigs.map((col, index) => {
            const isVisible = visibleColumns.includes(col.key);
            const isFirst = index === 0;
            const isLast = index === filteredConfigs.length - 1;
            const isBeingDragged = draggedColKey === col.key;
            const isTarget = dragOverColKey === col.key && !isBeingDragged;

            return (
              <div
                key={col.key}
                draggable={true}
                onDragStart={(e) => handleDragStart(e, col.key)}
                onDragOver={(e) => handleDragOver(e, col.key)}
                onDragLeave={(e) => handleDragLeave(e, col.key)}
                onDrop={(e) => handleDrop(e, col.key)}
                onDragEnd={handleDragEnd}
                className={`relative flex items-center justify-between p-2.5 rounded-xl border transition-all select-none ${
                  isBeingDragged
                    ? 'opacity-30 bg-blue-950/60 border-blue-500/70 scale-[0.98]'
                    : isTarget
                    ? 'bg-blue-950/30 border-blue-500/50'
                    : isVisible
                    ? 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                    : 'bg-slate-950/30 border-slate-900 opacity-60'
                }`}
              >
                {/* Drop Indicator Line */}
                {isTarget && dropPosition && (
                  <div
                    className={`absolute left-0 right-0 h-1 bg-gradient-to-r from-blue-400 via-sky-400 to-indigo-500 shadow-[0_0_10px_#3b82f6] z-20 pointer-events-none ${
                      dropPosition === 'above' ? '-top-1 rounded-t' : '-bottom-1 rounded-b'
                    }`}
                  />
                )}

                {/* Right: Grip Handle, Checkbox and Label */}
                <div className="flex items-center gap-2.5">
                  {/* Drag Handle */}
                  <div
                    className="p-1 text-slate-500 hover:text-blue-400 cursor-grab active:cursor-grabbing rounded transition-colors shrink-0"
                    title="اسحب لتغيير ترتيب العمود"
                  >
                    <GripVertical className="w-4 h-4" />
                  </div>

                  <div
                    className="flex items-center gap-2.5 cursor-pointer"
                    onClick={() => onToggleColumn(col.key)}
                  >
                    <button
                      type="button"
                      className={`p-1 rounded-md transition-colors ${
                        isVisible ? 'text-blue-400' : 'text-slate-600'
                      }`}
                    >
                      {isVisible ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    </button>
                    <div>
                      <span className={`text-xs font-bold ${isVisible ? 'text-white' : 'text-slate-400'}`}>
                        {col.label}
                      </span>
                      {col.tooltip && (
                        <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">{col.tooltip}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Left: Move Reorder Buttons */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={isFirst}
                    onClick={() => moveColumn(index, 'up')}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="تحريك لأعلى (يمين)"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={isLast}
                    onClick={() => moveColumn(index, 'down')}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="تحريك لأسفل (يسار)"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-800 pt-4 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-600/25 transition-all"
          >
            تطبيق وحفظ الإعدادات
          </button>
        </div>
      </div>
    </div>
  );
};
