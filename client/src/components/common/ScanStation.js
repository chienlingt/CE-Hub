/**
 * ScanStation — A2 Truck Loading Enforcement
 *
 * Driver → Loading
 * Admin  → Loading / Audit view
 *
 * Picking is handled by Odoo/warehouse — CE Hub starts from Loading.
 * There is no unloading step: the driver marks an order as arrived on the Deliveries tab.
 */

import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  Camera, ClipboardList,
  Check,
  ChevronDown,
  Pencil,
  RefreshCw,
  Search,
  ShieldAlert,
  Truck,
  X,
  XCircle,
} from 'lucide-react';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { API_BASE_URL as API_BASE } from '../../utils/apiBaseUrl';
import ScannerModal from './ScannerModal';
import ScanDeliveryDialog from './ScanDeliveryDialog';
import { useLocation, useNavigate } from 'react-router-dom';

export function compareLoadingOrders(a, b) {
  const timeA = a?.time_slots?.time_window_start || '';
  const timeB = b?.time_slots?.time_window_start || '';
  if (timeA !== timeB) return timeB.localeCompare(timeA);
  const slot = String(a?.time_slot_id || '').localeCompare(String(b?.time_slot_id || ''));
  if (slot) return slot;
  return (Number(a?.truck_loading_sequence) || Number.MAX_SAFE_INTEGER)
    - (Number(b?.truck_loading_sequence) || Number.MAX_SAFE_INTEGER);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(str) {
  if (!str) return '';
  const d = new Date(str);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleString('en-MY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function orderDate(order) {
  // Route ETAs may cross midnight. Keep the order on its assigned run's date.
  const slotDate = order.time_slots?.date;
  if (slotDate) return String(slotDate).slice(0, 10);
  const dt = order.scheduled_start_date_time || order.actual_start_date_time;
  if (!dt) return '';
  const date = new Date(dt);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
}

function useRole(employeeData) {
  const n = (employeeData?.role?.name || employeeData?.role || '').toString().toLowerCase();
  return {
    isAdmin:  n.includes('admin'),
    isDriver: n.includes('delivery') || n.includes('driver'),
  };
}

// ─── Date Strip ───────────────────────────────────────────────────────────────

function buildStrip(anchor) {
  const base = new Date(anchor + 'T00:00:00');
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i - 1);
    return { key: d.toLocaleDateString('en-CA'), day: d.toLocaleDateString('en-MY', { weekday: 'short' }), date: d.getDate() };
  });
}

function DateStrip({ selected, onChange }) {
  const today   = new Date().toLocaleDateString('en-CA');
  const strip   = useMemo(() => buildStrip(selected), [selected]);
  const dateRef = useRef(null);
  return (
    <div className="bg-white border-b border-gray-200 px-2 py-1 grid w-full grid-cols-8 gap-0.5 max-w-lg lg:border-b-0">
      {strip.map(({ key, day, date }) => (
        <button key={key} onClick={() => onChange(key)}
          className={`flex flex-col items-center min-w-0 min-h-11 py-1 rounded-xl transition-colors
            ${key === selected ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
          <span className="text-xs">{day}</span>
          <span className={`text-base font-semibold ${key === today && key !== selected ? 'text-blue-600' : ''}`}>{date}</span>
        </button>
      ))}
      <button onClick={() => dateRef.current?.showPicker?.()}
        className="flex flex-col items-center min-w-0 min-h-11 py-1 text-gray-400 hover:text-gray-600">
        <CalendarDays className="w-5 h-5 mx-auto" />
        <span className="text-xs mt-0.5">More</span>
      </button>
      <input ref={dateRef} type="date" value={selected}
        onChange={e => e.target.value && onChange(e.target.value)} className="sr-only" />
    </div>
  );
}

// ─── Status pill with tooltip ─────────────────────────────────────────────────

function StatusPill({ item }) {
  // Records from before the unloading step was removed may say 'unloaded': show them as loaded.
  const raw = item?.handling_status || 'pending';
  const status = raw === 'unloaded' ? 'loaded' : raw;
  const cfg = {
    pending: { label: 'Pending', cls: 'bg-gray-100 text-gray-500',       dot: 'bg-gray-400'    },
    loaded:  { label: 'Loaded',  cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  };
  const { label, cls, dot } = cfg[status] || cfg.pending;

  const byName = status === 'loaded' ? item.loaded_by_name : null;
  const at     = status === 'loaded' ? item.loaded_at : null;

  const pill = (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold cursor-default ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
      {label}
    </span>
  );

  if (!byName) return pill;

  return (
    <span className="relative group inline-flex">
      {pill}
      <span className="pointer-events-none absolute bottom-full left-0 mb-1.5 z-50
                       hidden group-hover:flex flex-col
                       bg-gray-900 text-white text-xs rounded-lg shadow-xl px-2.5 py-2
                       min-w-[160px] max-w-[220px]">
        <span className="font-semibold">{label} by {byName}</span>
        {at && <span className="text-gray-300 mt-0.5">{fmt(at)}</span>}
        <span className="absolute top-full left-3 border-4 border-transparent border-t-gray-900" />
      </span>
    </span>
  );
}

// ─── Error-only feedback ──────────────────────────────────────────────────────

function ErrorBanner({ fb, onDismiss }) {
  if (!fb || fb.ok) return null;
  const isMismatch = ['SERIAL_MISMATCH', 'LOADING_SERIAL_MISMATCH', 'RETURN_SERIAL_MISMATCH'].includes(fb.code);
  return (
    <div className="flex items-start gap-2.5 p-3 rounded-xl text-sm bg-red-50 text-red-700 border border-red-200">
      <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="font-medium">
          {isMismatch ? fb.msg.split('. ')[0] + '.' : fb.msg}
        </p>
        {isMismatch && (
          <p className="text-xs mt-0.5 opacity-80">
            Expected: <span className="font-mono font-bold">{fb.expected}</span>
            {' '}· Scanned: <span className="font-mono font-bold">{fb.scanned}</span>
          </p>
        )}
      </div>
      {onDismiss && (
        <button onClick={onDismiss} className="flex-shrink-0 opacity-60 hover:opacity-100">
          <XCircle size={14} />
        </button>
      )}
    </div>
  );
}

// ─── Scan submit ──────────────────────────────────────────────────────────────
// `stage` is 'loading' (the only scan stage), hitting handling-status (A2).

async function submitScan({ itemId, stage, employeeId, serialNumber }) {
  const body = { stage, employee_id: employeeId || null, serial_number: serialNumber.trim() };
  const res  = await fetch(`${API_BASE}/api/order-products/${itemId}/handling-status`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw { ...data, httpStatus: res.status };
  return data.orderProduct;
}

// ─── Sortable column header ────────────────────────────────────────────────────

function SortTh({ children, field, sort, onSort, className = '' }) {
  const active = sort.field === field;
  const Icon   = active ? (sort.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th
      onClick={() => onSort(field)}
      className={`px-4 py-3 text-left cursor-pointer select-none hover:bg-gray-100 transition-colors group ${className}`}
    >
      <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
        {children}
        <Icon size={12} className={active ? 'text-blue-500' : 'text-gray-300 group-hover:text-gray-400'} />
      </div>
    </th>
  );
}

// ─── useAllOrderItems ─────────────────────────────────────────────────────────

function useAllOrderItems(orders) {
  const [itemMap,  setItemMap]  = useState({});
  const [loading,  setLoading]  = useState(false);
  const orderIds = useMemo(() => orders.map(o => o.id).join(','), [orders]);

  const fetchAll = useCallback(async () => {
    if (!orders.length) { setItemMap({}); return; }
    setLoading(true);
    const results = await Promise.all(
      orders.map(o =>
        fetch(`${API_BASE}/api/orders/${o.id}/loading-status`)
          .then(r => r.json()).then(d => [o.id, d])
          .catch(() => [o.id, { items: o.order_products || [], total: 0 }])
      )
    );
    const map = {};
    results.forEach(([id, data]) => { map[id] = data; });
    setItemMap(map);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderIds]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const updateItem = useCallback((orderId, updatedItem) => {
    setItemMap(prev => {
      const od = prev[orderId];
      if (!od) return prev;
      const items = od.items.map(i => i.id === updatedItem.id ? { ...i, ...updatedItem } : i);
      return {
        ...prev,
        [orderId]: {
          ...od, items,
          loaded_count:   items.filter(i => ['loaded','unloaded'].includes(i.handling_status)).length,
          all_loaded:     items.every(i => ['loaded','unloaded'].includes(i.handling_status)),
        },
      };
    });
  }, []);

  return { itemMap, loadingItems: loading, refetchItems: fetchAll, updateItem };
}

// ─── Item Table ───────────────────────────────────────────────────────────────

export function ItemTable({ rows, allRows = rows, tab, employeeId, isAdmin, onUpdated, globalScanSerial, onGlobalScanError, isFiltered = false, onOpenOrder, groupByTruck = false }) {
  const [collapsedTrucks, setCollapsedTrucks] = useState({});
  const [rowFb,      setRowFb]      = useState({});
  const [busy,       setBusy]       = useState({});
  const [rowCam,     setRowCam]     = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [serialDrafts, setSerialDrafts] = useState({});
  const [savingSerial, setSavingSerial] = useState(null);
  const [editingSerial, setEditingSerial] = useState(null);

  const apiStage = 'loading'; // loading is the only scan stage
  const isActionableForTab = row => !['Failed', 'Delivered', 'Cancelled'].includes(row._order?.order_status) && row.handling_status === 'pending';

  // Handle global scan
  useEffect(() => {
    if (!globalScanSerial || !rows.length) return;
    const serial = globalScanSerial.trim();
    const normalizedSerial = serial.toLowerCase();
    // Prefer an actionable item explicitly assigned to this serial. A pending
    // row can retain an old completed-serial value after its status is reset;
    // that row must not report itself as a duplicate.
    const exactMatch = rows.find(r => {
      if (!isActionableForTab(r)) return false;
      const expectedSerial = r.assigned_serial;
      return expectedSerial?.trim().toLowerCase() === normalizedSerial;
    });
    if (exactMatch) {
      handleSubmit(exactMatch.id, exactMatch._orderId, serial);
      return;
    }

    const duplicate = rows.some(r => {
      if (isActionableForTab(r)) return false;
      const completedSerial = r.loaded_serial;
      return completedSerial?.trim().toLowerCase() === normalizedSerial;
    });
    if (duplicate) {
      onGlobalScanError?.({
        ok: false,
        code: 'SERIAL_DUPLICATE',
        msg: `Serial "${serial}" is duplicated.`,
      });
      return;
    }
    const match = rows.find(r => {
      if (!isActionableForTab(r)) return false;
      const expectedSerial = r.assigned_serial;
      return !expectedSerial?.trim();
    });
    if (!match) { onGlobalScanError?.({ ok: false, msg: `Serial "${serial}" not found in list.` }); return; }
    handleSubmit(match.id, match._orderId, serial);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalScanSerial]);

  const handleSubmit = async (itemId, orderId, serial) => {
    if (!serial?.trim()) return;
    setBusy(p => ({ ...p, [itemId]: true }));
    setRowFb(p => ({ ...p, [itemId]: null }));
    try {
      const updated = await submitScan({ itemId, stage: apiStage, employeeId, serialNumber: serial });
      onUpdated(orderId, updated);
    } catch (err) {
      const fb = { ok: false, msg: err.error || 'Scan failed', code: err.code, expected: err.expected, scanned: err.scanned };
      setRowFb(p => ({ ...p, [itemId]: fb }));
    } finally {
      setBusy(p => ({ ...p, [itemId]: false }));
    }
  };

  const handleCancelScan = async (item, orderId) => {
    const stageToCancel = { loaded: 'loading' };
    const stage = stageToCancel[item.handling_status];
    if (!stage || !window.confirm(`Cancel ${stage} scan for "${item.products?.product_name || item.odoo_product_name}"?`)) return;
    setCancelling(item.id);
    try {
      const res  = await fetch(`${API_BASE}/api/order-products/${item.id}/cancel-scan`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ stage, employee_id: employeeId }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Failed'); return; }
      onUpdated(orderId, data.orderProduct);
    } catch (err) { alert(err.message); }
    finally { setCancelling(null); }
  };

  const handleAssignSerial = async (item, orderId) => {
    const serial = (serialDrafts[item.id] || '').trim();
    if (!serial) {
      setRowFb(p => ({ ...p, [item.id]: { ok: false, msg: 'Serial number is required.' } }));
      return;
    }
    setSavingSerial(item.id);
    setRowFb(p => ({ ...p, [item.id]: null }));
    try {
      const res = await fetch(`${API_BASE}/api/order-products/${item.id}/assigned-serial`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: employeeId, serial_number: serial }),
      });
      const data = await res.json();
      if (!res.ok) throw data;
      onUpdated(orderId, data.orderProduct);
      setSerialDrafts(p => ({ ...p, [item.id]: '' }));
      setEditingSerial(null);
    } catch (err) {
      setRowFb(p => ({
        ...p,
        [item.id]: { ok: false, msg: err.error || 'Failed to assign serial number.', code: err.code },
      }));
    } finally {
      setSavingSerial(null);
    }
  };

  const beginSerialEdit = row => {
    setSerialDrafts(p => ({
      ...p,
      [row.id]: row.loaded_serial || row.assigned_serial || '',
    }));
    setRowFb(p => ({ ...p, [row.id]: null }));
    setEditingSerial(row.id);
  };

  const cancelSerialEdit = rowId => {
    setSerialDrafts(p => ({ ...p, [rowId]: '' }));
    setRowFb(p => ({ ...p, [rowId]: null }));
    setEditingSerial(null);
  };

  const renderAdminSerialControl = (row, mobile = false) => {
    if (tab !== 'loading' || !isAdmin) return null;
    const currentSerial = row.loaded_serial || row.assigned_serial || '';
    if (row.is_odoo_managed || row.odoo_line_id != null) return <div className="flex items-center justify-end gap-2" title="Serial assignments are managed in Odoo"><span className="break-all font-mono text-xs text-gray-600">{currentSerial || 'Awaiting Odoo serial'}</span><span className="text-[10px] text-gray-400">Odoo</span></div>;
    if (editingSerial !== row.id) {
      return (
        <div className={`${mobile ? 'md:hidden mt-2' : ''} flex items-center gap-1.5`}>
          {currentSerial
            ? <span className="font-mono text-xs break-all px-2 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200">{currentSerial}</span>
            : <span className="text-xs text-gray-300">—</span>}
          <button
            type="button"
            onClick={() => beginSerialEdit(row)}
            className="p-1 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded"
            title={currentSerial ? 'Edit serial number' : 'Add serial number'}
            aria-label={currentSerial ? 'Edit serial number' : 'Add serial number'}
          >
            <Pencil size={13} />
          </button>
        </div>
      );
    }
    return (
      <div className={`${mobile ? 'md:hidden mt-2' : ''} flex items-center gap-1.5`}>
        <input
          type="text"
          value={serialDrafts[row.id] || ''}
          onChange={e => setSerialDrafts(p => ({ ...p, [row.id]: e.target.value }))}
          onKeyDown={e => e.key === 'Enter' && handleAssignSerial(row, row._orderId)}
          placeholder="Enter serial number"
          className="min-w-0 w-36 px-2 py-1.5 text-xs font-mono border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
          disabled={savingSerial === row.id}
        />
        <button
          type="button"
          onClick={() => handleAssignSerial(row, row._orderId)}
          disabled={savingSerial === row.id || !(serialDrafts[row.id] || '').trim()}
          className="p-1.5 text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-40"
          title="Save serial number"
          aria-label="Save serial number"
        >
          {savingSerial === row.id ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
        </button>
        <button
          type="button"
          onClick={() => cancelSerialEdit(row.id)}
          disabled={savingSerial === row.id}
          className="p-1.5 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-40"
          title="Cancel editing"
          aria-label="Cancel editing"
        >
          <X size={13} />
        </button>
      </div>
    );
  };

  // Cards follow the saved loading order, then the DO reference.
  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const loadingOrder = compareLoadingOrders(a._order, b._order);
    if (loadingOrder) return loadingOrder;
    const refA = a._order?.odoo_order_ref || a._order?.id || '';
    const refB = b._order?.odoo_order_ref || b._order?.id || '';
    return String(refA).localeCompare(String(refB), undefined, { numeric: true });
  }), [rows]);

  if (!sorted.length) return null;

  const completedStatus = item => ['loaded', 'unloaded'].includes(item.handling_status);
  const groups = new Map();
  sorted.forEach(row => {
    if (!groups.has(row._orderId)) groups.set(row._orderId, { order: row._order, items: [] });
    groups.get(row._orderId).items.push(row);
  });
  const nextRows = [...allRows].sort((a, b) => compareLoadingOrders(a._order, b._order));
  const truckKey = order => order?.time_slots?.truck_id || order?.time_slots?.truck?.plate_no || 'unassigned';
  const nextByTruck = new Map();
  nextRows.filter(isActionableForTab).forEach(row => {
    const key = groupByTruck ? truckKey(row._order) : 'all';
    if (!nextByTruck.has(key)) nextByTruck.set(key, row._orderId);
  });
  const plates = [...new Set(allRows.map(row => row._order?.time_slots?.truck?.plate_no).filter(Boolean))];
  const slots = new Map();
  groups.forEach((group, id) => {
    const key = group.order?.time_slot_id || 'unassigned';
    if (!slots.has(key)) slots.set(key, { slot: group.order?.time_slots, cards: [] });
    slots.get(key).cards.push([id, group]);
  });
  const isLoaded = id => {
    const items = allRows.filter(row => row._orderId === id);
    return items.length > 0 && items.every(completedStatus);
  };
  const renderCard = ([id, { order, items }]) => {
    const muted = isLoaded(id);
    const next = nextByTruck.get(groupByTruck ? truckKey(order) : 'all') === id;
    const fullItems = allRows.filter(r => r._orderId === id);
    const loaded = fullItems.filter(completedStatus).length;
    const products = new Map();
    items.forEach(item => {
      const name = item.products?.product_name || item.odoo_product_name || `Item ${item.id}`;
      const key = item.product_id || name;
      if (!products.has(key)) products.set(key, { name, units: [] });
      products.get(key).units.push(item);
    });
    return <article key={id} aria-label={order?.odoo_order_ref || id} tabIndex={onOpenOrder ? 0 : undefined}
      onClick={event => { if (!event.target.closest('button, input, select, textarea, summary, details, a')) onOpenOrder?.(order); }}
      onKeyDown={event => { if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) { event.preventDefault(); onOpenOrder?.(order); } }}
      className={`overflow-hidden rounded-xl border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${onOpenOrder ? 'cursor-pointer' : ''} ${next ? 'border-blue-400 ring-1 ring-blue-100 bg-white' : muted ? 'border-gray-200 bg-gray-50 text-gray-500' : 'border-gray-200 bg-white'}`}>
      <header className={`px-4 py-3 lg:border-b lg:border-gray-100 lg:py-2 ${next ? 'bg-blue-50' : 'bg-gray-100/70'}`}>
        <div className="flex items-start justify-between gap-2 lg:items-center">
          <div className="min-w-0 lg:flex lg:items-center lg:gap-4">
            <p className={`mt-1 break-all text-sm font-semibold lg:mt-0 ${next ? 'text-blue-800' : muted ? 'text-gray-500' : 'text-gray-800'}`}>
              {order?.truck_loading_sequence && <span className="mr-2 font-mono text-gray-400">#{order.truck_loading_sequence}</span>}{order?.odoo_order_ref || id}
            </p>
            <p className="mt-0.5 text-xs text-gray-500 lg:mt-0 lg:border-l lg:border-gray-200 lg:pl-4">{order?.customers?.full_name}</p>
          </div>
          <div className="shrink-0 text-right text-xs lg:flex lg:items-center lg:gap-3">
            {next && <p className="mb-1 font-semibold text-blue-700 lg:mb-0">Next load</p>}
            <span className="text-gray-500">{loaded}/{fullItems.length} loaded</span>
          </div>
        </div>
      </header>
      {order?.odoo_picking_id != null && order.doo_ready !== true && <p className="bg-amber-50 px-4 py-2 text-xs text-amber-800">Awaiting Odoo preparation confirmation</p>}
      <div className="divide-y divide-gray-100">{[...products.entries()].map(([key, { name, units }]) => <div key={key} className="px-4 py-3 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] lg:items-start lg:gap-x-5 lg:py-1.5">
        <p className={`text-sm font-medium lg:py-2 ${muted ? 'text-gray-500' : 'text-gray-800'}`}>{name} <span className="font-normal text-gray-400">×{units.reduce((sum, unit) => sum + Number(unit.quantity || 1), 0)}</span></p>
        <div className="mt-1 min-w-0 divide-y divide-gray-100 lg:mt-0 lg:border-l lg:border-gray-100 lg:pl-5">{units.map(item => <div key={item.id} className="py-2">
          <div className={`flex min-w-0 items-center justify-between gap-2 lg:grid ${isAdmin ? 'lg:grid-cols-[minmax(0,1fr)_6rem_2rem]' : 'lg:grid-cols-[minmax(0,1fr)_6rem]'}`}>
            <div className="min-w-0 flex-1 lg:text-right lg:[&>div]:justify-end">{isAdmin ? renderAdminSerialControl(item) : <p className="break-all font-mono text-xs text-gray-500">{item.loaded_serial || item.assigned_serial || 'No serial assigned'}</p>}</div>
            <div className="shrink-0 lg:justify-self-end"><StatusPill item={item} /></div>
            {isAdmin && item.handling_status === 'loaded' && <details className="shrink-0"><summary aria-label="Item actions" className="cursor-pointer list-none p-2 text-gray-500">⋯</summary><button type="button" onClick={() => handleCancelScan(item, id)} disabled={cancelling === item.id} className="min-h-10 text-xs text-red-600">Cancel scan</button></details>}
          </div>
          {rowFb[item.id] && <ErrorBanner fb={rowFb[item.id]} onDismiss={() => setRowFb(p => ({ ...p, [item.id]: null }))} />}
        </div>)}</div>
      </div>)}</div>
    </article>;
  };
  const renderTruckItems = truckGroups => <div className="space-y-4">
    {[...slots.entries()].map(([slotId, { slot, cards: slotCards }]) => {
      const cards = slotCards.filter(([id]) => truckGroups.has(id));
      const visibleCards = [...cards].sort(([a], [b]) => Number(isLoaded(a)) - Number(isLoaded(b)));
      if (!visibleCards.length) return null;
      return <section key={slotId} aria-label={`Loading slot ${slot?.time_window_start || 'Unscheduled'}`} className="space-y-2">
        <h2 className="border-l-2 border-gray-300 px-2 text-xs font-semibold text-gray-500">{slot?.time_window_start || 'Unscheduled'}{slot?.time_window_end ? ` – ${slot.time_window_end}` : ''}</h2>
        {visibleCards.map(renderCard)}
      </section>;
    })}
  </div>;
  if (groupByTruck) {
    const trucks = new Map();
    groups.forEach((group, id) => {
      const key = truckKey(group.order);
      if (!trucks.has(key)) trucks.set(key, { plate: group.order?.time_slots?.truck?.plate_no || 'Truck unassigned', groups: new Map() });
      trucks.get(key).groups.set(id, group);
    });
    return <div className="space-y-4">{[...trucks.entries()].map(([key, truck]) => {
      const collapsed = Boolean(collapsedTrucks[key]);
      const truckItems = allRows.filter(row => truckKey(row._order) === key);
      return <section key={key} aria-label={`Truck ${truck.plate}`} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <button type="button" aria-expanded={!collapsed} onClick={() => setCollapsedTrucks(previous => ({ ...previous, [key]: !previous[key] }))}
          className="flex min-h-12 w-full items-center gap-2 bg-blue-50 px-4 py-3 text-left text-sm font-semibold text-blue-900 hover:bg-blue-100">
          <Truck size={17} /><span>{truck.plate}</span>
          <span className="ml-auto text-xs font-normal text-gray-500">{truck.groups.size} DO · {truckItems.length} items</span>
          <ChevronDown size={18} className={`shrink-0 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
        </button>
        <div hidden={collapsed} className="p-3 sm:p-4">{renderTruckItems(truck.groups)}</div>
      </section>;
    })}</div>;
  }
  return <div className="space-y-4">
    <p className="flex items-center gap-2 px-1 text-sm font-semibold text-gray-700"><Truck size={16} />{plates.join(' · ') || 'Truck unassigned'}</p>
    {renderTruckItems(groups)}
  </div>;
}

// ─── Audit table (read-only, admin only) ──────────────────────────────────────

function AuditCell({ name, at, serial, color }) {
  if (!name) return <span className="text-xs text-gray-300">—</span>;
  const colors = {
    blue:    'text-blue-600',
    emerald: 'text-emerald-600',
    purple:  'text-purple-600',
  };
  return (
    <div className="text-xs leading-snug">
      <p className={`font-semibold ${colors[color] || 'text-gray-700'}`}>{name}</p>
      <p className="text-gray-400">{fmt(at)}</p>
      {serial && <p className="font-mono text-gray-400 mt-0.5">{serial}</p>}
    </div>
  );
}

function AuditTable({ rows, isAdmin, employeeId, onUpdated }) {
  const [sort,      setSort]      = useState({ field: 'do', dir: 'asc' });
  const [resetting, setResetting] = useState(null);

  const handleResetScan = async (row) => {
    const name = row.products?.product_name || row.odoo_product_name || `Item #${row.id}`;
    if (!window.confirm(`Reset all scan progress for "${name}"? This cannot be undone.`)) return;
    setResetting(row.id);
    try {
      const res  = await fetch(`${API_BASE}/api/order-products/${row.id}/scan`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employee_id: employeeId }) });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Failed to reset item'); return; }
      onUpdated(row._orderId, {
        ...data.orderProduct,
        loaded_by_name:   null,
        unloaded_by_name: null,
      });
    } catch { alert('Failed to reset item'); }
    finally { setResetting(null); }
  };

  const handleSort = (field) =>
    setSort(prev => prev.field === field ? { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' });

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      let va, vb;
      if (sort.field === 'do')        { va = a._order?.odoo_order_ref || a._order?.id || ''; vb = b._order?.odoo_order_ref || b._order?.id || ''; }
      else if (sort.field === 'name') { va = a.products?.product_name || a.odoo_product_name || ''; vb = b.products?.product_name || b.odoo_product_name || ''; }
      else if (sort.field === 'status') {
        const o = ['pending', 'loaded', 'unloaded'];
        va = o.indexOf(a.handling_status); vb = o.indexOf(b.handling_status);
        return sort.dir === 'asc' ? va - vb : vb - va;
      }
      else return 0;
      const c = String(va).localeCompare(String(vb), undefined, { numeric: true });
      return sort.dir === 'asc' ? c : -c;
    });
  }, [rows, sort]);

  const grouped = useMemo(() => {
    const map = {};
    sorted.forEach(row => {
      const oid = row._orderId;
      if (!map[oid]) map[oid] = { orderId: oid, order: row._order, rows: [] };
      map[oid].rows.push(row);
    });
    return Object.values(map);
  }, [sorted]);

  if (!sorted.length) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Mobile sort strip */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-gray-100 bg-gray-50 md:hidden flex-wrap">
        <span className="text-xs text-gray-400 font-medium">Sort:</span>
        {[{ id: 'name', label: 'Name' }, { id: 'status', label: 'Status' }].map(f => {
          const active = sort.field === f.id;
          const Icon   = active ? (sort.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
          return (
            <button key={f.id} onClick={() => handleSort(f.id)}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border transition-colors
                ${active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}>
              {f.label}<Icon size={10} />
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-10">#</th>
              <SortTh field="name"   sort={sort} onSort={handleSort}>Item Name</SortTh>
              <SortTh field="status" sort={sort} onSort={handleSort}>Status</SortTh>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Loaded</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {grouped.map(({ orderId, order, rows: gRows }) => (
              <React.Fragment key={orderId}>
                {/* Per-order group header with Reset button for admin */}
                <tr className="bg-gray-50 border-t-2 border-gray-200">
                  <td colSpan={4} className="px-4 py-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-gray-600">
                        {order?.odoo_order_ref || 'Not Synced'}
                        {order?.customers?.full_name && (
                          <span className="font-normal text-gray-400 ml-2">{order.customers.full_name}</span>
                        )}
                      </span>
                    </div>
                  </td>
                </tr>
                {gRows.map((row, idx) => (
                  <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-400 text-xs font-medium">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{row.products?.product_name || row.odoo_product_name || `Item #${row.id}`}</p>
                      <p className="text-xs text-gray-400">×{row.quantity || 1}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <StatusPill item={row} />
                        {isAdmin && row.handling_status !== 'pending' && (
                          <button
                            onClick={() => handleResetScan(row)}
                            disabled={resetting === row.id}
                            className="text-red-400 hover:text-red-600 transition-colors disabled:opacity-40"
                            title="Reset scan progress"
                          >
                            {resetting === row.id
                              ? <RefreshCw size={11} className="animate-spin" />
                              : <XCircle size={11} />}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3"><AuditCell name={row.loaded_by_name}   at={row.loaded_at}   serial={row.loaded_serial}   color="emerald" /></td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main ScanStation ─────────────────────────────────────────────────────────

export default function ScanStation({ forcedStage }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { employeeData, loadingPermissions } = useAuth();
  const { isAdmin } = useRole(employeeData);

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });

  // Loading is the only stage; the Audit tab is admin-only.
  const tabOptions = useMemo(() => (
    forcedStage === 'audit' ? [{ id: 'audit', label: 'Audit' }] : [{ id: 'loading', label: 'Loading' }]
  ), [forcedStage]);

  // forcedStage determines the initial active tab
  const [tab, setTab] = useState(() => (forcedStage === 'audit' ? 'audit' : tabOptions[0].id));

  // Keep tab valid when tabOptions changes (auth loaded async).
  // useLayoutEffect runs before paint so the wrong tab is never shown.
  useLayoutEffect(() => {
    if (!tabOptions.find(t => t.id === tab)) setTab(tabOptions[0].id);
  }, [tabOptions, tab]);

  // Sync tab with forcedStage when prop changes
  useEffect(() => {
    if (forcedStage === 'driver') setTab('loading');
    else if (forcedStage === 'audit') setTab('audit');
  }, [forcedStage]);

  const orderStatus = tab === 'audit' ? 'all'
    : 'Scheduled,Loaded,Delivering,In Progress,Failed,Delivered';

  // ── Data ─────────────────────────────────────────────────────────────────────

  const [date,     setDate]     = useState(() => {
    const selected = new URLSearchParams(location.search).get('date');
    return /^\d{4}-\d{2}-\d{2}$/.test(selected || '') ? selected : today;
  });
  const [search,   setSearch]   = useState('');
  const [selectedTeam, setSelectedTeam] = useState(() => new URLSearchParams(location.search).get('team') || 'all');
  const [teams, setTeams] = useState([]);
  const [teamError, setTeamError] = useState('');
  const [detailOrder, setDetailOrder] = useState(null);
  const [orders,   setOrders]   = useState([]);
  const [fetching, setFetching] = useState(false);
  const orderSnapshot = useRef([]);
  const [changedRoute, setChangedRoute] = useState(null);

  const fetchTeams = useCallback(async signal => {
    if (!isAdmin || !employeeData?.id) return;
    try {
      const response = await fetch(`${API_BASE}/api/driver/admin/overview?employee_id=${encodeURIComponent(employeeData.id)}&date=${date}`, { signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load delivery teams.');
      if (!signal?.aborted) { setTeams(data.teams || []); setTeamError(''); }
    } catch (error) { if (!signal?.aborted) setTeamError(error.message); }
  }, [isAdmin, employeeData?.id, date]);
  useEffect(() => {
    const controller = new AbortController();
    setTeams([]);
    fetchTeams(controller.signal);
    const timer = setInterval(() => fetchTeams(controller.signal), 30000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [fetchTeams]);


  const fetchOrders = useCallback(async (quiet = false) => {
    if (loadingPermissions || (!isAdmin && !employeeData?.id)) return;
    if (!quiet) setFetching(true);
    try {
      const scope = !isAdmin ? `&driver_id=${encodeURIComponent(employeeData.id)}` : '';
      const res  = await fetch(`${API_BASE}/api/orders?status=${orderStatus}&sort=scheduled_asc&include_products=true${scope}`);
      const data = await res.json();
      if (!res.ok || !Array.isArray(data)) throw new Error('Unable to refresh orders');
      const previous = orderSnapshot.current;
      const loadingSlots = new Set(data.filter(o => o.order_products?.some(i => ['loaded', 'unloaded'].includes(i.handling_status))).map(o => o.time_slot_id));
      const changed = tab === 'loading' && previous.some(old => {
        const fresh = data.find(o => o.id === old.id);
        return fresh && loadingSlots.has(old.time_slot_id) && (fresh.truck_loading_sequence !== old.truck_loading_sequence || fresh.time_slot_id !== old.time_slot_id);
      });
      setChangedRoute(changed ? data : null);
      const next = changed ? data.map(o => {
        const old = previous.find(p => p.id === o.id);
        return old ? { ...o, truck_loading_sequence: old.truck_loading_sequence, time_slot_id: old.time_slot_id, time_slots: old.time_slots } : o;
      }) : data;
      orderSnapshot.current = next;
      setOrders(next);
    } catch { /* Keep the current checklist if a refresh fails. */ }
    finally { if (!quiet) setFetching(false); }
  }, [orderStatus, tab, isAdmin, employeeData?.id, loadingPermissions]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);
  useEffect(() => {
    const timer = setInterval(() => fetchOrders(true), 30000);
    return () => clearInterval(timer);
  }, [fetchOrders]);

  // Date filter only — search is applied at row level so only matching items show
  const filteredOrders = useMemo(() => {
    const team = teams.find(item => item.id === selectedTeam);
    const teamOrderIds = new Set(team?.runs?.flatMap(run => run.orders.map(order => order.id)) || []);
    return orders.filter(o => (!date || orderDate(o) === date) && (!isAdmin || selectedTeam === 'all'
      || o.time_slots?.delivery_team_id === selectedTeam || teamOrderIds.has(o.id)));
  }, [orders, date, isAdmin, selectedTeam, teams]);

  const { itemMap, loadingItems, refetchItems, updateItem } = useAllOrderItems(filteredOrders);

  const allRows = useMemo(() => filteredOrders.flatMap(order => {
      const items = itemMap[order.id]?.items || order.order_products || [];
      return items.map(item => ({ ...item, _orderId: order.id, _order: order }));
    }), [filteredOrders, itemMap]);
  const rows = useMemo(() => {
    if (!search) return allRows;
    const s = search.toLowerCase();
    return allRows.filter(row => {
      const name   = (row.products?.product_name || row.odoo_product_name || '').toLowerCase();
      const so     = row._order?.odoo_order_ref?.toLowerCase() || row._order?.id?.toLowerCase() || '';
      const cust   = row._order?.customers?.full_name?.toLowerCase() || '';
      const serial = [row.assigned_serial, row.loaded_serial, row.unloaded_serial]
                       .filter(Boolean).join(' ').toLowerCase();
      return name.includes(s) || so.includes(s) || cust.includes(s) || serial.includes(s);
    });
  }, [allRows, search]);

  const tabLabel = tab === 'audit' ? 'Audit' : 'Loading';

  // Global scan — loading tab
  const [showGlobalCam,    setShowGlobalCam]    = useState(false);
  const [globalScanSerial, setGlobalScanSerial] = useState(null);
  const [globalError,      setGlobalError]      = useState(null);

  // Audit tab is admin-only — block direct URL access by non-admins
  if (forcedStage === 'audit' && !isAdmin) {
    if (loadingPermissions) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <RefreshCw size={28} className="animate-spin text-gray-300" />
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-2 text-gray-400">
        <ShieldAlert size={40} className="opacity-30" />
        <p className="text-sm font-medium">Admin access required.</p>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-gray-50">

      {/* ── Header — sticky within the content scroll area ── */}
      <div className="z-20 shrink-0 bg-blue-700 shadow-sm">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3 lg:px-6">
          <div className="flex-shrink-0">
            <p className="text-base font-bold text-white">{tabLabel}</p>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button onClick={() => { fetchOrders(); refetchItems(); fetchTeams(); }}
              className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 transition-colors" title="Refresh">
              <RefreshCw className="w-4 h-4 text-white" />
            </button>
            {/* Global scan button — loading tab only */}
            {tab !== 'audit' && (
              <button onClick={() => setShowGlobalCam(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-white text-blue-700 font-bold text-sm rounded-xl hover:bg-blue-50 transition-colors shadow-sm">
                <Camera size={16} />
                <span className="hidden sm:inline">Scan Item</span>
                <span className="sm:hidden">Scan</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div role="region" aria-label={`${tabLabel} checklist`} tabIndex={0} className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-4 [touch-action:pan-y] [-webkit-overflow-scrolling:touch]">
      {/* Global scanner modal (loading) */}
      {showGlobalCam && (
        <ScannerModal
          itemName="Scan item to load"
          editBeforeConfirm
          onScan={v => { setShowGlobalCam(false); setGlobalScanSerial(v); setTimeout(() => setGlobalScanSerial(null), 200); }}
          onClose={() => setShowGlobalCam(false)}
        />
      )}

      {/* ── Date strip ─────────────────────────────────────────────── */}
      <div className="border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl lg:flex lg:items-center lg:gap-6 lg:px-6">
      <div className="lg:w-[28rem] lg:shrink-0"><DateStrip selected={date} onChange={d => setDate(d)} /></div>

      {/* ── Filter bar ─────────────────────────────────────────────── */}
      <div className="mx-auto bg-white px-4 py-2 lg:min-w-0 lg:flex-1 lg:px-0">
        <div className="flex flex-wrap items-center gap-2.5">
          {isAdmin && <select aria-label="Delivery team" value={selectedTeam} onChange={event => {
            const team = event.target.value;
            setSelectedTeam(team); setGlobalError(null); setGlobalScanSerial(null);
            navigate(`${location.pathname}?date=${date}&team=${encodeURIComponent(team)}`, { replace: true });
          }} className="min-h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 sm:w-52">
            <option value="all">All delivery teams</option>
            {teams.map(team => <option key={team.id} value={team.id}>{team.name}{team.truck_plates?.length ? ` · ${team.truck_plates.join(', ')}` : ''}</option>)}
            {selectedTeam !== 'all' && !teams.some(team => team.id === selectedTeam) && <option value={selectedTeam}>Selected delivery team</option>}
          </select>}
          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search DO, customer, item or serial…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
          </div>

        </div>
      </div>
      </div>
      {isAdmin && teamError && <p role="alert" className="mx-auto max-w-7xl px-4 py-2 text-sm text-red-600">{teamError}</p>}
      </div>
      {changedRoute && <div role="alert" className="mx-auto my-2 max-w-7xl rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
        Route changed after loading started. The previous loading order is still shown.
        <button type="button" className="mt-2 block min-h-10 rounded-lg bg-amber-100 px-3 font-semibold" onClick={() => { orderSnapshot.current = changedRoute; setOrders(changedRoute); setChangedRoute(null); }}>Use updated loading order</button>
      </div>}

      {/* ── Table ──────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 sm:py-5">
        {fetching || loadingItems ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
            <RefreshCw size={32} className="animate-spin" />
            <p className="text-sm">Loading orders…</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
            {tab === 'audit' ? <ClipboardList size={48} className="opacity-20" />
              : <Truck size={48} className="opacity-20" />}
            <p className="text-base font-medium text-gray-500">
              {search ? 'No items match your search.'
                : tab === 'audit'   ? 'No items for this date.'
                : `No ${tabLabel.toLowerCase()} items for this date.`}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-gray-400 font-medium px-1">
              {rows.length} item{rows.length !== 1 ? 's' : ''} · {filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''}
            </p>
            {globalError && (
              <ErrorBanner fb={globalError} onDismiss={() => setGlobalError(null)} />
            )}
            {tab === 'audit' ? (
              <AuditTable rows={rows} isAdmin={isAdmin} employeeId={employeeData?.id} onUpdated={updateItem} />
            ) : (
              <ItemTable
                rows={rows}
                allRows={allRows}
                onOpenOrder={order => {
                  if (window.matchMedia('(min-width: 1024px)').matches) setDetailOrder(order);
                  else navigate(`/scanning/delivery/${order.id}`, { state: { scanOrder: order, returnTo: `${location.pathname}?date=${date}&team=${encodeURIComponent(selectedTeam)}` } });
                }}
                isFiltered={Boolean(search)}
                tab={tab}
                employeeId={employeeData?.id || null}
                isAdmin={isAdmin}
                groupByTruck={isAdmin && selectedTeam === 'all'}
                onUpdated={updateItem}
                globalScanSerial={globalScanSerial}
                onGlobalScanError={setGlobalError}
              />
            )}
          </div>
        )}
      </div>
      </div>
      {detailOrder && <ScanDeliveryDialog key={detailOrder.id} order={detailOrder} onClose={() => { setDetailOrder(null); refetchItems(); fetchOrders(true); }} />}
    </div>
  );
}
