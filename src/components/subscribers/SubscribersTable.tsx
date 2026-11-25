import React, { useState, useRef } from 'react';
import {
  CheckSquare,
  Square,
  Eye,
  EyeOff,
  Copy,
  Smartphone,
  Laptop,
  Radio,
  Tv,
  Wifi,
  Power,
  Clock,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Edit2,
  RefreshCw,
  Zap,
  Trash2,
  Tag,
  HelpCircle,
  Sliders,
  Sparkles,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  GripVertical
} from 'lucide-react';
import { TableColumnConfig, TableDensity, ColumnSortState, SubscriberSystem } from './types';
import { ALL_SUBSCRIBER_COLUMNS, filterColumnsByStatus } from './tableColumnsConfig';
import {
  detectDeviceType,
  calculateRemainingTime,
  calculateRemainingData,
  formatDateTime,
  calculateIdleDuration,
  calculateSubscriberIdleInfo,
  calculateSubscriberDisconnectInfo,
  formatSpeedToArabic,
  resolveProfileLimits,
  SubscriberStatus
} from './subscriberUtils';
import { formatBytes } from '../../lib/formatters';
import { safeStorage } from '../../utils/safeStorage';

export interface SubscriberRowItem {
  id: string;
  name: string;
  password?: string;
  profile: string;
  rateLimit?: string;
  ipAddress?: string;
  uptime: string;
  bytesIn: number;
  bytesOut: number;
  limitUptime?: string;
  limitBytesTotal?: number;
  comment?: string;
  disabled?: boolean;
  macAddress?: string;
  callerId?: string;
  hostName?: string;
  createdAt?: string;
  price?: number;
  isVoucher?: boolean;
  status: SubscriberStatus;
  idleTime?: string;
  lastLoggedOut?: string;
  lastLoggedIn?: string;
  disconnectTime?: string;
  raw: any;
}

interface SubscribersTableProps {
  system: SubscriberSystem;
  items: SubscriberRowItem[];
  selectedIds: string[];
  onToggleSelectAll: () => void;
  onToggleSelectOne: (id: string) => void;
  sortState: ColumnSortState;
  onSortChange: (columnKey: string) => void;
  visibleColumns: string[];
  columnOrder: string[];
  onChangeColumnOrder?: (newOrder: string[]) => void;
  density: TableDensity;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
  statusFilter?: string;
}

export const SubscribersTable: React.FC<SubscribersTableProps> = ({
  system,
  items,
  selectedIds,
  onToggleSelectAll,
  onToggleSelectOne,
  sortState,
  onSortChange,
  visibleColumns,
  columnOrder,
  onChangeColumnOrder,
  density,
  showToast,
  statusFilter
}) => {
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [inspectingItem, setInspectingItem] = useState<SubscriberRowItem | null>(null);

  // High Performance Pagination & Display Settings State (Configured via Settings)
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number | 'all'>(() => {
    const saved = safeStorage.getItem('set_app_paging');
    if (saved === 'all') return 'all';
    const num = parseInt(saved || '20', 10);
    return isNaN(num) ? 20 : num;
  });
  const [isVirtualEnabled, setIsVirtualEnabled] = useState<boolean>(() => safeStorage.getItem('set_table_virtual') !== 'false');
  const [maskPasswordsDefault, setMaskPasswordsDefault] = useState<boolean>(() => safeStorage.getItem('set_table_mask_pass') !== 'false');
  const [showLiveBadgeSetting, setShowLiveBadgeSetting] = useState<boolean>(() => safeStorage.getItem('set_table_live_badge') !== 'false');

  const selectedIdSet = React.useMemo(() => new Set(selectedIds), [selectedIds]);

  // Listen to table settings changes from Settings Tab in real time
  React.useEffect(() => {
    const handleSettingsUpdate = () => {
      const saved = safeStorage.getItem('set_app_paging');
      if (saved === 'all') {
        setPageSize('all');
      } else {
        const num = parseInt(saved || '20', 10);
        setPageSize(isNaN(num) ? 20 : num);
      }
      setIsVirtualEnabled(safeStorage.getItem('set_table_virtual') !== 'false');
      setMaskPasswordsDefault(safeStorage.getItem('set_table_mask_pass') !== 'false');
      setShowLiveBadgeSetting(safeStorage.getItem('set_table_live_badge') !== 'false');
    };
    window.addEventListener('zctrl:table-settings-changed', handleSettingsUpdate);
    window.addEventListener('storage', handleSettingsUpdate);
    return () => {
      window.removeEventListener('zctrl:table-settings-changed', handleSettingsUpdate);
      window.removeEventListener('storage', handleSettingsUpdate);
    };
  }, []);

  // Auto-reset page on status filter change or items length change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [items.length, statusFilter]);

  const effectivePageSize = pageSize === 'all' ? (items.length > 0 ? items.length : 1) : pageSize;
  const totalPages = Math.max(1, Math.ceil(items.length / effectivePageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const displayedItems = React.useMemo(() => {
    if (pageSize === 'all') return items;
    const start = (safeCurrentPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, safeCurrentPage, pageSize]);

  // Virtual Scrolling Window for Flat RAM & Zero UI Freeze (Pillar 4)
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState<number>(0);
  const [viewportHeight, setViewportHeight] = useState<number>(650);

  React.useEffect(() => {
    const el = tableScrollRef.current;
    if (!el) return;
    const updateHeight = () => {
      if (el.clientHeight > 0) setViewportHeight(el.clientHeight);
    };
    updateHeight();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(updateHeight);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  const handleTableScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  const rowHeight = density === 'compact' ? 40 : density === 'relaxed' ? 64 : 50;
  const isVirtual = (isVirtualEnabled && displayedItems.length > 50) || (pageSize === 'all' && displayedItems.length > 200);

  const { virtualRows, topSpacerHeight, bottomSpacerHeight } = React.useMemo(() => {
    if (!isVirtual) {
      return { virtualRows: displayedItems, topSpacerHeight: 0, bottomSpacerHeight: 0 };
    }
    const overscan = 10;
    const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const endIndex = Math.min(displayedItems.length, Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan);

    const topSpacer = startIndex * rowHeight;
    const bottomSpacer = Math.max(0, (displayedItems.length - endIndex) * rowHeight);

    return {
      virtualRows: displayedItems.slice(startIndex, endIndex),
      topSpacerHeight: topSpacer,
      bottomSpacerHeight: bottomSpacer
    };
  }, [isVirtual, displayedItems, scrollTop, rowHeight, viewportHeight]);

  React.useEffect(() => {
    setScrollTop(0);
    if (tableScrollRef.current) {
      tableScrollRef.current.scrollTop = 0;
    }
  }, [safeCurrentPage, statusFilter, pageSize]);

  // Dynamic Column Widths state
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    ALL_SUBSCRIBER_COLUMNS.forEach((col) => {
      const parsed = typeof col.minWidth === 'number' ? col.minWidth : parseInt(String(col.minWidth || '130'), 10);
      initial[col.key] = isNaN(parsed) ? 140 : Math.max(parsed, 90);
    });
    return initial;
  });

  const [resizingColKey, setResizingColKey] = useState<string | null>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const dragEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (resizeCleanupRef.current) {
        resizeCleanupRef.current();
        resizeCleanupRef.current = null;
      }
      if (dragEndTimerRef.current) {
        clearTimeout(dragEndTimerRef.current);
        dragEndTimerRef.current = null;
      }
    };
  }, []);

  const handleMouseDownResize = (e: React.MouseEvent, colKey: string) => {
    e.stopPropagation();
    e.preventDefault();
    if (resizeCleanupRef.current) {
      resizeCleanupRef.current();
      resizeCleanupRef.current = null;
    }
    setResizingColKey(colKey);

    const startX = e.clientX;
    const startWidth = columnWidths[colKey] || 140;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      // In RTL table layout, dragging towards left increases width
      const delta = startX - moveEvent.clientX;
      const newWidth = Math.max(60, startWidth + delta);
      setColumnWidths((prev) => ({
        ...prev,
        [colKey]: newWidth
      }));
    };

    const handleMouseUp = () => {
      setResizingColKey(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      resizeCleanupRef.current = null;
    };

    resizeCleanupRef.current = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Drag and Drop state for table header columns
  const [draggedColKey, setDraggedColKey] = useState<string | null>(null);
  const [dragOverColKey, setDragOverColKey] = useState<string | null>(null);
  const [dropIndicatorSide, setDropIndicatorSide] = useState<'right' | 'left' | null>(null);
  const isDraggingColumnRef = useRef<boolean>(false);

  const handleHeaderDragStart = (e: React.DragEvent, colKey: string) => {
    isDraggingColumnRef.current = true;
    setDraggedColKey(colKey);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', colKey);
  };

  const handleHeaderDragOver = (e: React.DragEvent, colKey: string) => {
    if (!draggedColKey || draggedColKey === colKey) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const rect = e.currentTarget.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    // In RTL layout: right half (clientX > midX) is 'before', left half is 'after'
    const side = e.clientX > midX ? 'right' : 'left';
    setDragOverColKey(colKey);
    setDropIndicatorSide(side);
  };

  const handleHeaderDragLeave = (e: React.DragEvent, colKey: string) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    if (dragOverColKey === colKey) {
      setDragOverColKey(null);
      setDropIndicatorSide(null);
    }
  };

  const handleHeaderDrop = (e: React.DragEvent, targetColKey: string) => {
    e.preventDefault();
    if (!draggedColKey || draggedColKey === targetColKey || !onChangeColumnOrder) {
      setDraggedColKey(null);
      setDragOverColKey(null);
      setDropIndicatorSide(null);
      return;
    }

    const currentOrder = [...columnOrder];
    const sourceIdx = currentOrder.indexOf(draggedColKey);
    if (sourceIdx === -1) return;

    // Remove source
    currentOrder.splice(sourceIdx, 1);

    const targetIdx = currentOrder.indexOf(targetColKey);
    if (targetIdx === -1) return;

    // In RTL: side 'right' is before targetIdx; side 'left' is after targetIdx (targetIdx + 1)
    const insertIdx = dropIndicatorSide === 'right' ? targetIdx : targetIdx + 1;
    currentOrder.splice(insertIdx, 0, draggedColKey);

    onChangeColumnOrder(currentOrder);

    const colConfig = ALL_SUBSCRIBER_COLUMNS.find((c) => c.key === draggedColKey);
    showToast(`تم تغيير ترتيب الأعمدة: تم نقل "${colConfig?.label || draggedColKey}"`, 'info');

    setDraggedColKey(null);
    setDragOverColKey(null);
    setDropIndicatorSide(null);
  };

  const handleHeaderDragEnd = () => {
    setDraggedColKey(null);
    setDragOverColKey(null);
    setDropIndicatorSide(null);
    if (dragEndTimerRef.current) clearTimeout(dragEndTimerRef.current);
    dragEndTimerRef.current = setTimeout(() => {
      dragEndTimerRef.current = null;
      isDraggingColumnRef.current = false;
    }, 120);
  };

  const getColStyle = (key: string, minW?: string | number) => {
    const w = columnWidths[key] || (typeof minW === 'number' ? minW : parseInt(minW || '120', 10));
    return { width: `${w}px`, minWidth: `${w}px`, maxWidth: `${w}px` };
  };

  const toggleShowPassword = (id: string) => {
    setShowPasswords((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copyCreds = async (name: string, pass?: string) => {
    const text = `User: ${name} | Pass: ${pass || name}`;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      showToast(`تم نسخ بيانات المشترك (${name}) إلى الحافظة`, 'success');
    } catch {
      showToast('تعذر النسخ إلى الحافظة تلقائياً', 'error');
    }
  };

  // Ordered visible columns filtered by status to prevent status tables and columns from overlapping
  const orderedVisibleColumns = React.useMemo(() => {
    // Ensure essential columns for the active status view are present in visible set
    const effectiveVisible = [...visibleColumns];
    if (statusFilter === 'idle') {
      if (!effectiveVisible.includes('idleTime')) effectiveVisible.push('idleTime');
      if (!effectiveVisible.includes('disconnectTime')) effectiveVisible.push('disconnectTime');
    } else if (statusFilter === 'online') {
      if (!effectiveVisible.includes('connectionTime')) effectiveVisible.push('connectionTime');
    } else if (statusFilter === 'suspended') {
      if (!effectiveVisible.includes('suspensionTime')) effectiveVisible.push('suspensionTime');
    }

    // Build column ordering ensuring active columns are represented
    const effectiveOrder = [...columnOrder];
    if (statusFilter === 'idle' && !effectiveOrder.includes('idleTime')) {
      const idx = effectiveOrder.indexOf('username');
      effectiveOrder.splice(idx !== -1 ? idx + 2 : 2, 0, 'idleTime');
    }
    if (statusFilter === 'idle' && !effectiveOrder.includes('disconnectTime')) {
      const idx = effectiveOrder.indexOf('idleTime');
      effectiveOrder.splice(idx !== -1 ? idx + 1 : 3, 0, 'disconnectTime');
    }

    const raw = effectiveOrder
      .map((key) => ALL_SUBSCRIBER_COLUMNS.find((c) => c.key === key))
      .filter((c): c is TableColumnConfig => c !== undefined && effectiveVisible.includes(c.key));
    return filterColumnsByStatus(raw, statusFilter || 'all');
  }, [columnOrder, visibleColumns, statusFilter]);

  // Density padding classes
  const cellPaddingClass =
    density === 'compact' ? 'py-2 px-3 text-[11px]' : density === 'relaxed' ? 'py-4 px-4 text-xs' : 'py-3 px-3.5 text-xs';

  const isAllSelected = items.length > 0 && items.every((i) => selectedIdSet.has(i.id));

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
      {/* Criteria Inspector Modal */}
      {inspectingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl text-right">
            <div className="p-4 bg-slate-800/80 border-b border-slate-700/80 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    معايير المشترك الأصلية في المايكروتك ({inspectingItem.name})
                  </h3>
                  <p className="text-xs text-slate-400">
                    قراءة تفصيلية لكافة بارامترات المشترك بدون أي تغيير أو تعديل على الراوتر
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectingItem(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto font-sans">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/50">
                  <span className="text-xs text-slate-400 block mb-1">اسم المستخدم (Name):</span>
                  <span className="font-mono font-bold text-white">{inspectingItem.name}</span>
                </div>
                <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/50">
                  <span className="text-xs text-slate-400 block mb-1">كلمة المرور (Password):</span>
                  <span className="font-mono font-bold text-emerald-400">{inspectingItem.password || '—'}</span>
                </div>
                <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/50">
                  <span className="text-xs text-slate-400 block mb-1">البروفايل (Profile):</span>
                  <span className="font-bold text-cyan-300">{inspectingItem.profile}</span>
                </div>
                <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/50">
                  <span className="text-xs text-slate-400 block mb-1">حالة الحساب في الراوتر:</span>
                  <span className={`font-bold ${inspectingItem.disabled ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {inspectingItem.disabled ? 'معطل (Disabled)' : 'مفعل (Enabled)'}
                  </span>
                </div>
                <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/50">
                  <span className="text-xs text-slate-400 block mb-1">حد الوقت (limit-uptime):</span>
                  <span className="font-mono text-slate-200">{inspectingItem.limitUptime || 'مفتوح (لا يوجد حد)'}</span>
                </div>
                <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/50">
                  <span className="text-xs text-slate-400 block mb-1">حد البيانات (limit-bytes-total):</span>
                  <span className="font-mono text-slate-200">
                    {inspectingItem.limitBytesTotal ? formatBytes(inspectingItem.limitBytesTotal) : 'مفتوح (لا يوجد حد)'}
                  </span>
                </div>
                <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/50">
                  <span className="text-xs text-slate-400 block mb-1">الوقت المستهلك (uptime):</span>
                  <span className="font-mono text-slate-200">{inspectingItem.uptime || '0s'}</span>
                </div>
                <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/50">
                  <span className="text-xs text-slate-400 block mb-1">إجمالي الاستهلاك (Traffic):</span>
                  <span className="font-mono text-slate-200">
                    {formatBytes((inspectingItem.bytesIn || 0) + (inspectingItem.bytesOut || 0))}
                  </span>
                </div>
                <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/50">
                  <span className="text-xs text-slate-400 block mb-1">فترة الخمول (Idle Time):</span>
                  <span className="font-mono font-bold text-sky-400">
                    {calculateSubscriberIdleInfo(inspectingItem).text} — {calculateSubscriberIdleInfo(inspectingItem).detail}
                  </span>
                </div>
                <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/50">
                  <span className="text-xs text-slate-400 block mb-1">وقت وتاريخ قطع الاتصال (Disconnect):</span>
                  <span className="font-mono font-bold text-amber-300">
                    {calculateSubscriberDisconnectInfo(inspectingItem).displayText}{' '}
                    {calculateSubscriberDisconnectInfo(inspectingItem).subText ? `(${calculateSubscriberDisconnectInfo(inspectingItem).subText})` : ''}
                  </span>
                </div>
                <div className="col-span-2 p-3 bg-slate-800/60 rounded-xl border border-slate-700/50">
                  <span className="text-xs text-slate-400 block mb-1">الملاحظات والتعليق (Comment):</span>
                  <span className="text-slate-300 text-xs">{inspectingItem.comment || 'لا توجد ملاحظات'}</span>
                </div>
              </div>

              <div>
                <span className="text-xs text-slate-400 block mb-1 font-bold">
                  كافة الحقول والبارامترات الخام من المايكروتك (Raw RouterOS Attributes):
                </span>
                <pre className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-emerald-400 font-mono overflow-x-auto max-h-40 leading-relaxed text-left" dir="ltr">
                  {JSON.stringify(inspectingItem.raw || inspectingItem, null, 2)}
                </pre>
              </div>
            </div>

            <div className="p-4 bg-slate-800/40 border-t border-slate-700/60 flex justify-end">
              <button
                type="button"
                onClick={() => setInspectingItem(null)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm font-bold transition-colors"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
      <div
        ref={tableScrollRef}
        onScroll={isVirtual ? handleTableScroll : undefined}
        className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-270px)] md:max-h-[680px] border border-slate-800/80 rounded-xl relative shadow-inner"
      >
        <table className="w-full text-right text-slate-300 border-collapse">
          {/* Table Header */}
          <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-bold select-none text-xs sticky top-0 z-10">
            <tr>
              {/* Checkbox Column */}
              <th className={`${cellPaddingClass} w-10 text-center`}>
                <button
                  type="button"
                  onClick={onToggleSelectAll}
                  className="text-slate-400 hover:text-white cursor-pointer transition-colors p-1"
                  title={isAllSelected ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
                >
                  {isAllSelected ? (
                    <CheckSquare className="w-4 h-4 text-blue-400" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                </button>
              </th>

              {/* Dynamic Ordered Columns */}
              {orderedVisibleColumns.map((col) => {
                const isSorted = sortState.key === col.key;
                const isBeingDragged = draggedColKey === col.key;
                const isDragTarget = dragOverColKey === col.key && !isBeingDragged;

                return (
                  <th
                    key={col.key}
                    draggable={Boolean(onChangeColumnOrder)}
                    onDragStart={(e) => handleHeaderDragStart(e, col.key)}
                    onDragOver={(e) => handleHeaderDragOver(e, col.key)}
                    onDragLeave={(e) => handleHeaderDragLeave(e, col.key)}
                    onDrop={(e) => handleHeaderDrop(e, col.key)}
                    onDragEnd={handleHeaderDragEnd}
                    style={getColStyle(col.key, col.minWidth)}
                    className={`${cellPaddingClass} font-bold relative group/col overflow-hidden text-ellipsis whitespace-nowrap select-none transition-colors ${
                      col.align === 'center' ? 'text-center' : col.align === 'left' ? 'text-left' : 'text-right'
                    } ${
                      isBeingDragged
                        ? 'opacity-30 bg-blue-950/60 border-y border-dashed border-blue-400 cursor-grabbing'
                        : isDragTarget
                        ? 'bg-blue-950/40'
                        : Boolean(onChangeColumnOrder)
                        ? 'cursor-grab active:cursor-grabbing hover:bg-slate-900/90'
                        : col.canSort
                        ? 'cursor-pointer hover:bg-slate-900/80'
                        : ''
                    }`}
                    onClick={() => {
                      if (isDraggingColumnRef.current) return;
                      if (col.canSort) onSortChange(col.key);
                    }}
                    title={`${col.label} — اضغط للفرز أو اسحب بالماوس لترتيب موقعه`}
                  >
                    {/* Glowing Drop Indicator Line */}
                    {isDragTarget && dropIndicatorSide && (
                      <div
                        className={`absolute top-0 bottom-0 w-1 bg-gradient-to-b from-blue-400 via-sky-400 to-indigo-500 shadow-[0_0_12px_#3b82f6] z-30 pointer-events-none animate-pulse ${
                          dropIndicatorSide === 'right' ? 'right-0' : 'left-0'
                        }`}
                      />
                    )}

                    <div
                      className={`inline-flex items-center gap-1.5 ${
                        col.align === 'center' ? 'justify-center' : 'justify-start'
                      }`}
                    >
                      {/* Drag Grip Handle Icon */}
                      {onChangeColumnOrder && (
                        <span
                          className="cursor-grab active:cursor-grabbing p-0.5 inline-flex items-center"
                          title="اسحب لتغيير ترتيب العمود"
                        >
                          <GripVertical
                            className="w-3.5 h-3.5 text-slate-500 group-hover/col:text-blue-400 opacity-30 group-hover/col:opacity-100 transition-opacity shrink-0"
                          />
                        </span>
                      )}

                      <span className="truncate">{col.label}</span>

                      {col.canSort && (
                        <span className="text-slate-500 shrink-0">
                          {isSorted ? (
                            sortState.direction === 'asc' ? (
                              <ArrowUp className="w-3.5 h-3.5 text-blue-400" />
                            ) : (
                              <ArrowDown className="w-3.5 h-3.5 text-blue-400" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 opacity-40 hover:opacity-100" />
                          )}
                        </span>
                      )}
                    </div>

                    {/* Column Resizer Drag Handle */}
                    <div
                      draggable={false}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        handleMouseDownResize(e, col.key);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      title="انقر وسحب لتكبير وتوسيع عرض هذا العمود"
                      className={`absolute top-0 bottom-0 left-0 w-2.5 cursor-col-resize z-20 flex items-center justify-center transition-all ${
                        resizingColKey === col.key
                          ? 'bg-blue-500 w-3 opacity-100'
                          : 'opacity-20 group-hover/col:opacity-100 hover:bg-blue-500/70 hover:w-3'
                      }`}
                    >
                      <div className="w-0.5 h-3.5 bg-slate-200/80 rounded-full" />
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-slate-800/60 font-medium">
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={orderedVisibleColumns.length + 1}
                  className="p-12 text-center text-slate-500 font-medium space-y-2"
                >
                  <div className="w-12 h-12 rounded-2xl bg-slate-800/50 flex items-center justify-center mx-auto text-slate-400">
                    <HelpCircle className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-bold text-slate-400">لا يوجد مشتركين في هذا الجدول مطابقين للمعايير</p>
                  <p className="text-xs text-slate-500">
                    جرب تغيير جدول الحالة أو تعديل عبارة البحث أو البروفايل المحدد
                  </p>
                </td>
              </tr>
            ) : (
              <>
                {topSpacerHeight > 0 && (
                  <tr style={{ height: `${topSpacerHeight}px` }} aria-hidden="true">
                    <td colSpan={orderedVisibleColumns.length + 1} />
                  </tr>
                )}
                {virtualRows.map((item) => {
                const isSelected = selectedIdSet.has(item.id);
                const isShowPass = showPasswords[item.id] !== undefined ? showPasswords[item.id] : !maskPasswordsDefault;
                const device = detectDeviceType(item.macAddress, item.callerId, item.comment, item.hostName);
                const remainingTime = calculateRemainingTime(
                  item.limitUptime,
                  item.uptime,
                  item.raw?.endTime || item.raw?.['end-time'] || item.raw?.['till-time'],
                  item.profile,
                  item.raw?._resolvedTimeSec
                );
                const remainingData = calculateRemainingData(
                  item.limitBytesTotal,
                  (item.bytesIn || 0) + (item.bytesOut || 0),
                  item.profile,
                  item.raw?._resolvedDataBytes
                );

                return (
                  <tr
                    key={item.id}
                    style={isVirtual ? { height: `${rowHeight}px` } : undefined}
                    onClick={() => onToggleSelectOne(item.id)}
                    onDoubleClick={() => setInspectingItem(item)}
                    title="انقر لتحديد المشترك، أو انقر مزدوجاً لفحص معايير المايكروتك الأصلية"
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-blue-950/45 hover:bg-blue-950/60'
                        : 'hover:bg-slate-800/40'
                    }`}
                  >
                    {/* Checkbox Cell */}
                    <td
                      className={`${cellPaddingClass} text-center`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => onToggleSelectOne(item.id)}
                        className="text-slate-400 hover:text-white cursor-pointer transition-colors p-1"
                      >
                        {isSelected ? (
                           <CheckSquare className="w-4 h-4 text-blue-400" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </td>

                    {/* Dynamic Ordered Cells */}
                    {orderedVisibleColumns.map((col) => {
                      const colStyle = getColStyle(col.key, col.minWidth);
                      switch (col.key) {
                        // 1. Username / Code
                        case 'username':
                          return (
                            <td key={col.key} style={colStyle} className={cellPaddingClass}>
                              <div className="flex items-center gap-1.5 overflow-hidden">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setInspectingItem(item);
                                  }}
                                  className="text-slate-500 hover:text-blue-400 p-0.5 rounded transition-colors shrink-0"
                                  title="فحص كافة معايير وبارامترات المشترك الأصلية في المايكروتك (Raw Attributes)"
                                >
                                  <Sliders className="w-3.5 h-3.5" />
                                </button>
                                <span dir="ltr" className="font-bold text-white font-mono truncate unicode-isolate">{item.name}</span>
                                {item.isVoucher && (
                                  <span className="text-[9px] bg-amber-500/15 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded-md font-sans font-bold inline-flex items-center gap-1 shrink-0">
                                    <Tag className="w-2.5 h-2.5" />
                                    كرت
                                  </span>
                                )}
                              </div>
                            </td>
                          );

                        // 2. Password
                        case 'password':
                          return (
                            <td
                              key={col.key}
                              style={colStyle}
                              className={cellPaddingClass}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-center gap-1.5 font-mono overflow-hidden">
                                <span dir="ltr" className="text-slate-300 text-[11px] truncate unicode-isolate">
                                  {isShowPass ? item.password || item.name : '••••••'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => toggleShowPassword(item.id)}
                                  className="text-slate-500 hover:text-slate-300 p-0.5 rounded transition-colors shrink-0"
                                  title={isShowPass ? 'إخفاء' : 'إظهار كلمة السر'}
                                >
                                  {isShowPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => copyCreds(item.name, item.password)}
                                  className="text-slate-500 hover:text-slate-300 p-0.5 rounded transition-colors shrink-0"
                                  title="نسخ بيانات الدخول"
                                >
                                  <Copy className="w-3 h-3" />
                                </button>
                              </div>
                            </td>
                          );

                        // 3. Status Badge
                        case 'status':
                          return (
                            <td key={col.key} style={colStyle} className={`${cellPaddingClass} text-center`}>
                              {item.status === 'online' && (
                                <span className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 rounded-full text-[10px] font-bold inline-flex items-center gap-1.5 shadow-sm">
                                  <span className={`w-1.5 h-1.5 rounded-full bg-emerald-400 ${showLiveBadgeSetting ? 'animate-pulse' : ''}`}></span>
                                  متصل الآن
                                </span>
                              )}
                              {item.status === 'idle' && (
                                <span className="bg-sky-500/15 text-sky-300 border border-sky-500/30 px-2.5 py-1 rounded-full text-[10px] font-bold inline-flex items-center gap-1.5">
                                  <Wifi className="w-3 h-3 text-sky-400" />
                                  خامل
                                </span>
                              )}
                              {item.status === 'suspended' && (
                                <span className="bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2.5 py-1 rounded-full text-[10px] font-bold inline-flex items-center gap-1.5">
                                  <Power className="w-3 h-3 text-amber-400" />
                                  معلق / معطل
                                </span>
                              )}
                              {item.status === 'expired' && (
                                <span className="bg-rose-500/15 text-rose-300 border border-rose-500/30 px-2.5 py-1 rounded-full text-[10px] font-bold inline-flex items-center gap-1.5">
                                  <Clock className="w-3 h-3 text-rose-400" />
                                  منتهي
                                </span>
                              )}
                              {item.status === 'new' && (
                                <span className="bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 px-2.5 py-1 rounded-full text-[10px] font-bold inline-flex items-center gap-1.5">
                                  <Sparkles className="w-3 h-3 text-indigo-400" />
                                  جديد (لم يتصل)
                                </span>
                              )}
                            </td>
                          );

                        // 4. Device Type
                        case 'deviceType':
                          return (
                            <td key={col.key} style={colStyle} className={cellPaddingClass}>
                              <div className="flex items-center gap-2 overflow-hidden">
                                <div className="p-1 rounded-md bg-slate-800 border border-slate-700/80 text-blue-400 shrink-0">
                                  {device.iconType === 'laptop' ? (
                                    <Laptop className="w-3.5 h-3.5" />
                                  ) : device.iconType === 'router' ? (
                                    <Radio className="w-3.5 h-3.5" />
                                  ) : device.iconType === 'tv' ? (
                                    <Tv className="w-3.5 h-3.5" />
                                  ) : (
                                    <Smartphone className="w-3.5 h-3.5" />
                                  )}
                                </div>
                                <div className="overflow-hidden">
                                  <span className="font-semibold text-slate-200 block truncate text-xs">
                                    {device.label}
                                  </span>
                                  <div className="flex items-center gap-1.5 overflow-hidden text-[10px] font-mono">
                                    <span dir="ltr" className="text-slate-400 truncate unicode-isolate">
                                      {item.macAddress || item.callerId || 'تلقائي'}
                                    </span>
                                    {item.ipAddress && (
                                      <>
                                        <span className="text-slate-600">•</span>
                                        <span dir="ltr" className="text-cyan-400 font-semibold truncate unicode-isolate">
                                          {item.ipAddress}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                          );

                        // 5. Profile & Speed
                        case 'profile':
                          return (
                            <td key={col.key} style={colStyle} className={cellPaddingClass}>
                              <div className="flex flex-col gap-1 overflow-hidden">
                                <span
                                  className={`px-2 py-0.5 rounded-lg border text-xs font-semibold block truncate ${
                                    !item.profile || item.profile === 'default'
                                      ? 'bg-slate-800/80 text-slate-300 border-slate-700'
                                      : 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                                  }`}
                                  title={item.profile || 'افتراضي'}
                                >
                                  {!item.profile || item.profile === 'default' ? 'افتراضي (default)' : item.profile}
                                </span>
                                {item.rateLimit ? (
                                  <span
                                    dir="ltr"
                                    className="text-[10px] font-mono text-emerald-400 font-bold flex items-center gap-1 truncate unicode-isolate"
                                    title={`السرعة المحددة: ${item.rateLimit}`}
                                  >
                                    <Zap className="w-3 h-3 text-amber-400 shrink-0" />
                                    {formatSpeedToArabic(item.rateLimit)}
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-mono text-slate-500 flex items-center gap-1 truncate">
                                    <span className="text-slate-600">⚡</span>
                                    غير محدودة
                                  </span>
                                )}
                              </div>
                            </td>
                          );

                        // 6. Connection Time
                        case 'connectionTime':
                          return (
                            <td key={col.key} style={colStyle} className={cellPaddingClass}>
                              <div className="flex items-center gap-1.5 font-mono overflow-hidden">
                                {item.status === 'online' && (
                                  <span className={`w-1.5 h-1.5 rounded-full bg-emerald-400 ${showLiveBadgeSetting ? 'animate-pulse' : ''} shrink-0`}></span>
                                )}
                                <span dir="ltr" className={`truncate unicode-isolate ${item.status === 'online' ? 'text-emerald-300 font-bold' : 'text-slate-300'}`}>
                                  {item.uptime || '0s'}
                                </span>
                              </div>
                            </td>
                          );

                        // 7. Idle Time (فترة الخمول الحقيقية حسب الراوتر وحالة الجلسة)
                        case 'idleTime': {
                          const idleInfo = calculateSubscriberIdleInfo(item);
                          let badgeBg = 'bg-slate-800/60 text-slate-300 border-slate-700/50';
                          if (idleInfo.badgeType === 'active') {
                            badgeBg = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
                          } else if (idleInfo.badgeType === 'light_idle') {
                            badgeBg = 'bg-sky-500/10 text-sky-300 border-sky-500/30';
                          } else if (idleInfo.badgeType === 'high_idle') {
                            badgeBg = 'bg-amber-500/10 text-amber-300 border-amber-500/30';
                          } else if (idleInfo.badgeType === 'offline_recent') {
                            badgeBg = 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30';
                          } else if (idleInfo.badgeType === 'never') {
                            badgeBg = 'bg-slate-800/40 text-slate-400 border-slate-700/30';
                          } else if (idleInfo.badgeType === 'suspended') {
                            badgeBg = 'bg-rose-500/10 text-rose-300 border-rose-500/30';
                          }

                          return (
                            <td key={col.key} style={colStyle} className={cellPaddingClass}>
                              <div className="flex flex-col gap-0.5" title={idleInfo.detail}>
                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-mono font-bold w-fit ${badgeBg}`}>
                                  {idleInfo.badgeType === 'active' && (
                                    <span className={`w-1.5 h-1.5 rounded-full bg-emerald-400 ${showLiveBadgeSetting ? 'animate-pulse' : ''} inline-block`} />
                                  )}
                                  {idleInfo.text}
                                </span>
                                <span className="text-[10px] text-slate-400 truncate max-w-[150px]">
                                  {idleInfo.detail}
                                </span>
                              </div>
                            </td>
                          );
                        }

                        // 8. Disconnect Time (وقت وتاريخ قطع الاتصال الحقيقي)
                        case 'disconnectTime': {
                          const discInfo = calculateSubscriberDisconnectInfo(item);

                          return (
                            <td key={col.key} style={colStyle} className={cellPaddingClass}>
                              <div className="flex flex-col gap-0.5" title={discInfo.tooltip}>
                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-mono font-bold w-fit ${discInfo.badgeClass}`}>
                                  {discInfo.isOnline && (
                                    <span className={`w-1.5 h-1.5 rounded-full bg-emerald-400 ${showLiveBadgeSetting ? 'animate-pulse' : ''} inline-block`} />
                                  )}
                                  {discInfo.displayText}
                                </span>
                                {discInfo.subText && (
                                  <span className="text-[10px] text-slate-400 font-mono truncate max-w-[150px]">
                                    {discInfo.subText}
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        }

                        // 9. Remaining Time & Data
                        case 'remainingTimeAndData':
                          return (
                            <td key={col.key} style={colStyle} className={cellPaddingClass}>
                              <div className="space-y-1 overflow-hidden">
                                <div className="flex items-center justify-between gap-1 text-[11px]">
                                  <span className="text-slate-400 shrink-0">الوقت:</span>
                                  <span
                                    className={`font-semibold font-mono truncate ${
                                      remainingTime.isExpired
                                        ? 'text-rose-400'
                                        : remainingTime.percentage < 20
                                        ? 'text-amber-400'
                                        : 'text-emerald-400'
                                    }`}
                                  >
                                    {remainingTime.text}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between gap-1 text-[11px]">
                                  <span className="text-slate-400 shrink-0">البيانات:</span>
                                  <span
                                    className={`font-semibold font-mono truncate ${
                                      remainingData.isExpired
                                        ? 'text-rose-400'
                                        : remainingData.percentage < 20
                                        ? 'text-amber-400'
                                        : 'text-blue-400'
                                    }`}
                                  >
                                    {remainingData.text}
                                  </span>
                                </div>
                              </div>
                            </td>
                          );

                        // 10. Voucher Limit Time & Quota
                        case 'voucherTimeAndData': {
                          const profileLimits = resolveProfileLimits(item.profile, item.raw?._matchedProfile, {
                            limitUptime: item.limitUptime,
                            limitBytesTotal: item.limitBytesTotal
                          });
                          const displayTime = profileLimits.hasTimeLimit ? profileLimits.timeLimitStr : 'غير محدد';
                          const displayBytes = profileLimits.hasDataLimit ? profileLimits.dataLimitStr : 'غير محدد';

                          return (
                            <td key={col.key} style={colStyle} className={cellPaddingClass}>
                              <div className="space-y-0.5 font-mono text-[11px] overflow-hidden">
                                <div className="text-slate-200 truncate" title={`وقت الكرت المحدد: ${displayTime}`}>
                                  وقت: <span className="font-semibold text-emerald-400">{displayTime}</span>
                                </div>
                                <div className="text-slate-400 truncate" title={`حجم البيانات المحدد: ${displayBytes}`}>
                                  حجم: <span className="text-cyan-400">{displayBytes}</span>
                                </div>
                              </div>
                            </td>
                          );
                        }

                        // 11. Suspension Time
                        case 'suspensionTime':
                          return (
                            <td key={col.key} style={colStyle} className={cellPaddingClass}>
                              {item.disabled || item.status === 'suspended' ? (
                                <div className="text-amber-400 text-[11px] font-semibold flex items-center gap-1 overflow-hidden">
                                  <Power className="w-3 h-3 shrink-0" />
                                  <span className="truncate">معلق (إيقاف إداري)</span>
                                </div>
                              ) : (
                                <span className="text-slate-500 text-xs">—</span>
                              )}
                            </td>
                          );

                        // 12. Card Generation / Creation Date
                        case 'creationDate':
                          return (
                            <td key={col.key} style={colStyle} className={cellPaddingClass}>
                              <span className="font-mono text-slate-400 text-[11px] block truncate">
                                {formatDateTime(item.createdAt)}
                              </span>
                            </td>
                          );

                        // 13. Price
                        case 'price':
                          return (
                            <td key={col.key} style={colStyle} className={`${cellPaddingClass} text-center`}>
                              <span className="font-bold text-amber-400 font-mono text-xs block truncate">
                                {item.price ? `${item.price} ر.س` : 'مجاني'}
                              </span>
                            </td>
                          );

                        // 14. Notes
                        case 'notes':
                          return (
                            <td key={col.key} style={colStyle} className={cellPaddingClass}>
                              <span
                                className="text-slate-400 text-xs block truncate"
                                title={item.comment || 'لا توجد ملاحظات'}
                              >
                                {item.comment || '—'}
                              </span>
                            </td>
                          );

                        default:
                          return null;
                      }
                    })}
                  </tr>
                );
              })}
              {bottomSpacerHeight > 0 && (
                <tr style={{ height: `${bottomSpacerHeight}px` }} aria-hidden="true">
                  <td colSpan={orderedVisibleColumns.length + 1} />
                </tr>
              )}
            </>
          )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer Controls */}
      {items.length > 0 && (
        <div className="bg-slate-950 border-t border-slate-800 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400 select-none">
          {/* Item count & Range info */}
          <div className="flex items-center gap-3">
            <span>
              عرض <strong className="text-slate-200 font-mono">{pageSize === 'all' ? 1 : (safeCurrentPage - 1) * pageSize + 1}</strong> إلى{' '}
              <strong className="text-slate-200 font-mono">{pageSize === 'all' ? items.length : Math.min(safeCurrentPage * pageSize, items.length)}</strong> من أصل{' '}
              <strong className="text-blue-400 font-mono font-bold">{items.length.toLocaleString()}</strong> مشترك
            </span>

            {/* Page Size Selector */}
            <div className="flex items-center gap-1.5 border-r border-slate-800 pr-3 mr-1">
              <span className="text-slate-500 text-[11px]">عدد العناصر:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  const val = e.target.value === 'all' ? 'all' : Number(e.target.value);
                  setPageSize(val);
                  safeStorage.setItem('set_app_paging', String(val));
                  setCurrentPage(1);
                }}
                className="bg-slate-900 border border-slate-700/80 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value={15}>15 لكل صفحة</option>
                <option value={20}>20 لكل صفحة</option>
                <option value={50}>50 لكل صفحة</option>
                <option value={100}>100 لكل صفحة</option>
                <option value={250}>250 لكل صفحة</option>
                <option value={500}>500 لكل صفحة</option>
                <option value="all">الكل ({items.length})</option>
              </select>
            </div>
          </div>

          {/* Navigation Controls */}
          {pageSize !== 'all' && totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage(1)}
                disabled={safeCurrentPage <= 1}
                className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-slate-900 text-slate-300 transition-colors"
                title="الصفحة الأولى"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safeCurrentPage <= 1}
                className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-slate-900 text-slate-300 transition-colors"
                title="الصفحة السابقة"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <span className="px-3 text-xs font-mono font-bold text-slate-200">
                صفحة <span className="text-blue-400">{safeCurrentPage}</span> من <span className="text-slate-400">{totalPages}</span>
              </span>

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safeCurrentPage >= totalPages}
                className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-slate-900 text-slate-300 transition-colors"
                title="الصفحة التالية"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage(totalPages)}
                disabled={safeCurrentPage >= totalPages}
                className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-slate-900 text-slate-300 transition-colors"
                title="الصفحة الأخيرة"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
