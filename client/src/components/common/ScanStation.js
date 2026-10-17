/**
 * ScanStation — A2 Truck Loading Enforcement
 *
 * Driver → Loading / Unloading toggle
 * Admin  → Loading / Unloading / Audit view
 *
 * Picking is handled by Odoo/warehouse — CE Hub starts from Loading.
 */

import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  Camera, ClipboardList,
  Check,
  Pencil,
  RefreshCw,
  Search,
  ShieldAlert,
  Truck,
  User,
  X,
  XCircle,
} from 'lucide-react';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { API_BASE_URL as API_BASE } from '../../utils/apiBaseUrl';
import ScannerModal from './ScannerModal';

export function compareLoadingOrders(a, b) {
  const timeA = a?.time_slots?.time_window_start || '';
  const timeB = b?.time_slots?.time_window_start || '';
  if (timeA !== timeB) return timeB.localeCompare(timeA);
  const slot = String(a?.time_slot_id || '').localeCompare(String(b?.time_slot_id || ''));
  if (slot) return slot;
  return (Number(a?.truck_loading_sequence) || Number.MAX_SAFE_INTEGER)
    - (Number(b?.truck_loading_sequence) || Number.MAX_SAFE_INTEGER);
}

export function compareUnloadingOrders(a, b) {
  const timeA = a?.time_slots?.time_window_start || '99:99';
  const timeB = b?.time_slots?.time_window_start || '99:99';
  if (timeA !== timeB) return timeA.localeCompare(timeB);
  const slot = String(a?.time_slot_id || '').localeCompare(String(b?.time_slot_id || ''));
  if (slot) return slot;
  // Saved loading numbers run in reverse delivery order. Missing ranks go last.
  return (Number(b?.truck_loading_sequence) || 0) - (Number(a?.truck_loading_sequence) || 0);
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
    <div className="bg-white border-b border-gray-200 px-2 py-1 grid grid-cols-8 gap-0.5 max-w-lg">
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
  const status = item?.handling_status || 'pending';
  const cfg = {
    pending:  { label: 'Pending',  cls: 'bg-gray-100 text-gray-500',       dot: 'bg-gray-400'    },
    loaded:   { label: 'Loaded',   cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
    unloaded: { label: 'Unloaded', cls: 'bg-purple-100 text-purple-700',   dot: 'bg-purple-500'  },
  };
  const { label, cls, dot } = cfg[status] || cfg.pending;

  const byName = status === 'unloaded' ? item.unloaded_by_name
               : status === 'loaded'   ? item.loaded_by_name : null;
  const at     = status === 'unloaded' ? item.unloaded_at
               : status === 'loaded'   ? item.loaded_at : null;

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
  const isMismatch = ['SERIAL_MISMATCH', 'LOADING_SERIAL_MISMATCH', 'UNLOADING_SERIAL_MISMATCH', 'RETURN_SERIAL_MISMATCH'].includes(fb.code);
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
// `stage` is 'loading' or 'unloading', hitting picking-status (A2).

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
          unloaded_count: items.filter(i => i.handling_status === 'unloaded').length,
          all_loaded:     items.every(i => ['loaded','unloaded'].includes(i.handling_status)),
          all_unloaded:   items.every(i => i.handling_status === 'unloaded'),
        },
      };
    });
  }, []);

  return { itemMap, loadingItems: loading, refetchItems: fetchAll, updateItem };
}

// ─── Item Table ───────────────────────────────────────────────────────────────

export function ItemTable({ rows, allRows = rows, tab, employeeId, isAdmin, onUpdated, globalScanSerial, onGlobalScanError, isFiltered = false }) {
  const [rowFb,      setRowFb]      = useState({});
  const [busy,       setBusy]       = useState({});
  const [rowCam,     setRowCam]     = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [serialDrafts, setSerialDrafts] = useState({});
  const [savingSerial, setSavingSerial] = useState(null);
  const [editingSerial, setEditingSerial] = useState(null);
  const [sort,        setSort]        = useState({ field: 'do', dir: 'asc' });

  const apiStage = tab === 'loading' ? 'loading' : 'unloading';
  const isActionableForTab = row => !['Failed', 'Delivered', 'Cancelled'].includes(row._order?.order_status) && (tab === 'loading'
    ? row.handling_status === 'pending'
    : row.handling_status === 'loaded');

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
      const expectedSerial = tab === 'loading' ? r.assigned_serial : r.loaded_serial;
      return expectedSerial?.trim().toLowerCase() === normalizedSerial;
    });
    if (exactMatch) {
      handleSubmit(exactMatch.id, exactMatch._orderId, serial);
      return;
    }

    const duplicate = rows.some(r => {
      if (isActionableForTab(r)) return false;
      const completedSerial = tab === 'loading' ? r.loaded_serial : r.unloaded_serial;
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
      const expectedSerial = tab === 'loading' ? r.assigned_serial : r.loaded_serial;
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
    const stageToCancel = { loaded: 'loading', unloaded: 'unloading' };
    const stage = stageToCancel[item.handling_status];
    if (!stage || !window.confirm(`Cancel ${stage} scan for "${item.products?.product_name || item.odoo_product_name}"?`)) return;
    setCancelling(item.id);
    try {
      const res  = await fetch(`${API_BASE}/api/order-products/${item.id}/cancel-scan`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ stage }),
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

  // Sorting inside the table
  const handleSort = (field) =>
    setSort(prev => prev.field === field ? { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' });

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (tab === 'loading') {
        const loadingOrder = compareLoadingOrders(a._order, b._order);
        if (loadingOrder) return loadingOrder;
      }
      if (tab === 'unloading') {
        const deliveryOrder = compareUnloadingOrders(a._order, b._order);
        if (deliveryOrder) return deliveryOrder;
      }
      let va, vb;
      if (sort.field === 'do')     { va = a._order?.odoo_order_ref || a._order?.id || ''; vb = b._order?.odoo_order_ref || b._order?.id || ''; }
      else if (sort.field === 'name')   { va = a.products?.product_name || a.odoo_product_name || ''; vb = b.products?.product_name || b.odoo_product_name || ''; }
      else if (sort.field === 'serial') {
        const displaySerial = r => tab === 'loading'
          ? (r.loaded_serial   || r.assigned_serial)
          : (r.unloaded_serial || r.loaded_serial);
        va = displaySerial(a) || ''; vb = displaySerial(b) || '';
      }
      else if (sort.field === 'status') { const o = ['pending','loaded','unloaded']; va = o.indexOf(a.handling_status); vb = o.indexOf(b.handling_status); return sort.dir === 'asc' ? va - vb : vb - va; }
      else return 0;
      const c = String(va).localeCompare(String(vb), undefined, { numeric: true });
      return sort.dir === 'asc' ? c : -c;
    });
  }, [rows, sort, tab]);

  if (!sorted.length) return null;

  // Shared row renderer used in both flat (loading) and grouped (unloading) modes
  const renderRow = (row) => {
    const isActionable = isActionableForTab(row);
    const fb  = rowFb[row.id];
    return (
      <React.Fragment key={row.id}>
        <tr className={`transition-colors ${isActionable ? 'bg-blue-50/40' : 'hover:bg-gray-50'}`}>
          {/* Item Name */}
          <td className="px-4 py-3">
            <p className="font-semibold text-gray-900">{row.products?.product_name || row.odoo_product_name || `Item #${row.id}`}</p>
            <p className="text-xs text-gray-400">×{row.quantity || 1}</p>
            {/* DO inline on mobile */}
            {/* Serial inline on mobile */}
            {(() => {
              if (isAdmin && tab === 'loading') return null;
              const s = tab === 'loading'
                ? (row.loaded_serial   || row.assigned_serial)
                : (row.unloaded_serial || row.loaded_serial);
              const cls = tab === 'loading'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-purple-50 text-purple-700 border-purple-200';
              return s ? (
                <span className={`md:hidden inline-block break-all font-mono text-xs px-1.5 py-0.5 rounded border mt-0.5 ${cls}`}>{s}</span>
              ) : null;
            })()}
            {renderAdminSerialControl(row, true)}
          </td>
          {/* Serial No. */}
          <td className="px-4 py-3 hidden md:table-cell">
            {(() => {
              const serial =
                tab === 'loading'
                  ? (row.loaded_serial   || row.assigned_serial)
                  : (row.unloaded_serial || row.loaded_serial);
              const color =
                tab === 'loading'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-purple-50 text-purple-700 border-purple-200';
              if (isAdmin && tab === 'loading') {
                return renderAdminSerialControl(row);
              }
              if (serial) {
                return <span className={`font-mono text-xs px-2 py-0.5 rounded border ${color}`}>{serial}</span>;
              }
              return <span className="text-xs text-gray-300">—</span>;
            })()}
          </td>
          {/* Status */}
          <td className="px-4 py-3">
            <div className="flex items-center justify-end gap-1.5">
              <StatusPill item={row} />
              {isAdmin && row.handling_status !== 'pending' && (
                <details className="relative">
                <summary aria-label="Item actions" className="cursor-pointer list-none rounded-lg px-2 py-1 text-gray-500 hover:bg-gray-100">⋯</summary>
                <button
                  onClick={() => handleCancelScan(row, row._orderId)}
                  disabled={cancelling === row.id}
                  className="flex min-h-10 items-center gap-2 rounded-lg bg-red-50 px-2 text-xs text-red-600 disabled:opacity-40"
                  title="Cancel scan"
                >
                  {cancelling === row.id
                    ? <RefreshCw size={11} className="animate-spin" />
                    : <XCircle size={14} />} Cancel scan
                </button>
                </details>
              )}
            </div>
          </td>
        </tr>
        {fb && !fb.ok && (
          <tr className="border-0">
            <td colSpan={3} className="px-4 pb-2 pt-0">
              <ErrorBanner fb={fb} onDismiss={() => setRowFb(p => ({ ...p, [row.id]: null }))} />
            </td>
          </tr>
        )}
      </React.Fragment>
    );
  };

  if (tab === 'loading' || tab === 'unloading') {
    const unloading = tab === 'unloading';
    const completedStatus = item => unloading ? item.handling_status === 'unloaded' : ['loaded', 'unloaded'].includes(item.handling_status);
    const groups = new Map();
    sorted.forEach(row => {
      if (!groups.has(row._orderId)) groups.set(row._orderId, { order: row._order, items: [] });
      groups.get(row._orderId).items.push(row);
    });
    const nextRow = [...allRows].sort((a, b) => (unloading ? compareUnloadingOrders : compareLoadingOrders)(a._order, b._order)).find(isActionableForTab);
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
      const next = nextRow?._orderId === id;
      const fullItems = allRows.filter(r => r._orderId === id);
      const loaded = fullItems.filter(completedStatus).length;
      const deliveryPosition = [...new Map([...allRows].sort((a, b) => compareUnloadingOrders(a._order, b._order)).filter(r => r._order?.time_slot_id === order?.time_slot_id).map(r => [r._orderId, r._order])).keys()].indexOf(id) + 1;
      const products = new Map();
      items.forEach(item => {
        const name = item.products?.product_name || item.odoo_product_name || `Item ${item.id}`;
        const key = item.product_id || name;
        if (!products.has(key)) products.set(key, { name, units: [] });
        products.get(key).units.push(item);
      });
      return <article key={id} aria-label={order?.odoo_order_ref || id} className={`overflow-hidden rounded-xl border ${next ? 'border-blue-400 ring-1 ring-blue-100 bg-white' : muted ? 'border-gray-200 bg-gray-50 text-gray-500' : 'border-gray-200 bg-white'}`}>
        <header className={`px-4 py-3 ${next ? 'bg-blue-50' : 'bg-gray-100/70'}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className={`mt-1 break-all text-sm font-semibold ${next ? 'text-blue-800' : muted ? 'text-gray-500' : 'text-gray-800'}`}>
                {(unloading || order?.truck_loading_sequence) && <span className="mr-2 font-mono text-gray-400">#{unloading ? deliveryPosition : order.truck_loading_sequence}</span>}{order?.odoo_order_ref || id}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">{order?.customers?.full_name}</p>
            </div>
            <div className="shrink-0 text-right text-xs">
              {next && <p className="mb-1 font-semibold text-blue-700">{unloading ? 'Next unload' : 'Next load'}</p>}
              <span className="text-gray-500">{loaded}/{fullItems.length} {unloading ? 'unloaded' : 'loaded'}</span>
            </div>
          </div>
        </header>
        <div className="divide-y divide-gray-100">{[...products.entries()].map(([key, { name, units }]) => <div key={key} className="px-4 py-3">
          <p className={`text-sm font-medium ${muted ? 'text-gray-500' : 'text-gray-800'}`}>{name} <span className="font-normal text-gray-400">×{units.reduce((sum, unit) => sum + Number(unit.quantity || 1), 0)}</span></p>
          <div className="mt-1 divide-y divide-gray-100">{units.map(item => <div key={item.id} className="py-2">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <div className="min-w-0 flex-1">{isAdmin && !unloading ? renderAdminSerialControl(item) : <p className="break-all font-mono text-xs text-gray-500">{(unloading && item.unloaded_serial) || item.loaded_serial || item.assigned_serial || 'No serial assigned'}</p>}</div>
              <StatusPill item={item} />
              {isAdmin && item.handling_status === (unloading ? 'unloaded' : 'loaded') && <details className="shrink-0"><summary aria-label="Item actions" className="cursor-pointer list-none p-2 text-gray-500">⋯</summary><button type="button" onClick={() => handleCancelScan(item, id)} disabled={cancelling === item.id} className="min-h-10 text-xs text-red-600">Cancel scan</button></details>}
            </div>
            {rowFb[item.id] && <ErrorBanner fb={rowFb[item.id]} onDismiss={() => setRowFb(p => ({ ...p, [item.id]: null }))} />}
          </div>)}</div>
        </div>)}</div>
      </article>;
    };
    const unloadedCards = unloading ? [...groups.entries()].filter(([id]) => isLoaded(id)) : [];
    return <div className="space-y-4">
      <p className="flex items-center gap-2 px-1 text-sm font-semibold text-gray-700"><Truck size={16} />{plates.join(' · ') || 'Truck unassigned'}</p>
      {[...slots.entries()].map(([slotId, { slot, cards }]) => {
        const visibleCards = unloading ? cards.filter(([id]) => !isLoaded(id)) : [...cards].sort(([a], [b]) => Number(isLoaded(a)) - Number(isLoaded(b)));
        if (!visibleCards.length) return null;
        return <section key={slotId} aria-label={`${unloading ? 'Unloading' : 'Loading'} slot ${slot?.time_window_start || 'Unscheduled'}`} className="space-y-2">
          <h2 className="px-1 text-xs font-semibold text-gray-500">{slot?.time_window_start || 'Unscheduled'}{slot?.time_window_end ? ` – ${slot.time_window_end}` : ''}</h2>
          {visibleCards.map(renderCard)}
        </section>;
      })}
      {unloadedCards.length > 0 && <section aria-label="Unloaded deliveries" className="space-y-2">
        <h2 className="px-1 text-xs font-semibold text-gray-400">Unloaded</h2>
        {unloadedCards.map(renderCard)}
      </section>}
    </div>;
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Mobile sort strip — column headers are hidden on small screens */}
      <div className={`${tab === 'loading' ? 'hidden' : 'flex'} items-center gap-1.5 px-4 py-2 border-b border-gray-100 bg-gray-50 flex-wrap`}>
        <span className="text-xs text-gray-400 font-medium">Sort:</span>
        {[{ id: 'do', label: 'DO' }, { id: 'serial', label: 'Serial' }, { id: 'name', label: 'Name' }, { id: 'status', label: 'Status' }].map(f => {
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
          <thead className="sticky top-0 z-10 hidden md:table-header-group">
            <tr className="bg-gray-50 border-b border-gray-200">
              <SortTh field="name"   sort={sort} onSort={handleSort}>Item Name</SortTh>
              <SortTh field="serial" sort={sort} onSort={handleSort} className="hidden md:table-cell">Serial No.</SortTh>
              <SortTh field="status" sort={sort} onSort={handleSort}>Status</SortTh>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(() => {
              // Group by order to show per-order Completed / Incompleted badge
              const groups = [];
              const gmap   = {};
              sorted.forEach(row => {
                if (!gmap[row._orderId]) {
                  const g = { orderId: row._orderId, order: row._order, rows: [] };
                  gmap[row._orderId] = g;
                  groups.push(g);
                }
                gmap[row._orderId].rows.push(row);
              });
              return groups.map(({ orderId, order, rows: gRows }) => {
                const slot = order?.time_slots;
                const tripKey = order?.time_slot_id || 'unassigned';
                const firstInTrip = groups.find(g => (g.order?.time_slot_id || 'unassigned') === tripKey)?.orderId === orderId;
                const completed = gRows.filter(r => tab === 'loading'
                  ? ['loaded', 'unloaded'].includes(r.handling_status)
                  : r.handling_status === 'unloaded').length;
                const allDone = completed === gRows.length;
                const doRef = order?.odoo_order_ref || orderId;
                return (
                  <React.Fragment key={orderId}>
                    {tab === 'loading' && firstInTrip && <tr className="bg-blue-50"><td colSpan={3} className="px-4 py-3 text-sm font-semibold text-blue-800">
                      {slot?.truck?.plate_no || 'Truck unassigned'} · {slot?.time_window_start || 'Unscheduled'}{slot?.time_window_end ? ` – ${slot.time_window_end}` : ''}
                    </td></tr>}
                    {/* Per-order header with completion badge */}
                    <tr className="bg-gray-50 border-t-2 border-gray-200">
                      <td colSpan={3} className="px-4 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-mono text-xs font-bold text-gray-700 break-all">{tab === 'loading' && <span className="mr-2 text-blue-600">{order?.truck_loading_sequence ? `Load ${order.truck_loading_sequence}` : 'Sequence unavailable'}</span>}{doRef}</p>
                            {order?.customers?.full_name && (
                              <span className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                                <User size={9} />{order.customers.full_name}
                              </span>
                            )}
                          </div>
                          <span className={`flex-shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold
                            ${allDone ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                            {completed}/{gRows.length} {tab === 'loading' ? 'loaded' : 'unloaded'}{isFiltered ? ' matched' : ''}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {gRows.map(row => renderRow(row))}
                  </React.Fragment>
                );
              });
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
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

function AuditTable({ rows, isAdmin, onUpdated }) {
  const [sort,      setSort]      = useState({ field: 'do', dir: 'asc' });
  const [resetting, setResetting] = useState(null);

  const handleResetScan = async (row) => {
    const name = row.products?.product_name || row.odoo_product_name || `Item #${row.id}`;
    if (!window.confirm(`Reset all scan progress for "${name}"? This cannot be undone.`)) return;
    setResetting(row.id);
    try {
      const res  = await fetch(`${API_BASE}/api/order-products/${row.id}/scan`, { method: 'DELETE' });
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
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Unloaded</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {grouped.map(({ orderId, order, rows: gRows }) => (
              <React.Fragment key={orderId}>
                {/* Per-order group header with Reset button for admin */}
                <tr className="bg-gray-50 border-t-2 border-gray-200">
                  <td colSpan={5} className="px-4 py-2">
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
                    <td className="px-4 py-3"><AuditCell name={row.unloaded_by_name} at={row.unloaded_at} serial={row.unloaded_serial} color="purple" /></td>
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

// ─── ScannerSection (exported — used by truckSchedule.js) ────────────────────

export function ScannerSection({ order, stage, employeeId, items, onItemUpdated }) {
  const [showCam, setShowCam] = useState(false);
  const [serial,  setSerial]  = useState('');
  const [fb,      setFb]      = useState(null);
  const [busy,    setBusy]    = useState(false);
  const inputRef = useRef(null);

  const apiStage   = stage === 'driver' ? 'loading' : 'unloading';
  const canStatuses = stage === 'driver' ? ['pending'] : ['loaded'];
  const doneStatus = stage === 'driver' ? ['loaded','unloaded'] : ['unloaded'];
  const doneLabel  = stage === 'driver' ? 'Loaded' : 'Unloaded';

  const nextItem  = items.find(i => canStatuses.includes(i.handling_status));
  const allDone   = items.length > 0 && items.every(i => doneStatus.includes(i.handling_status));
  const noneReady = !nextItem && !allDone;

  const submit = async (value) => {
    if (!value?.trim() || !nextItem) return;
    setBusy(true); setFb(null);
    try {
      const updated = await submitScan({ itemId: nextItem.id, stage: apiStage, employeeId, serialNumber: value });
      onItemUpdated(updated);
      setSerial('');
      setTimeout(() => setFb(null), 4000);
      inputRef.current?.focus();
    } catch (err) {
      setFb({ ok: false, msg: err.error || 'Scan failed', code: err.code, expected: err.expected, scanned: err.scanned });
    } finally { setBusy(false); }
  };

  if (allDone) return (
    <div className="flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-50 text-emerald-700 text-sm font-semibold">
      All {doneLabel.toLowerCase()} ✓
    </div>
  );

  if (noneReady) return (
    <div className="flex items-center gap-2 py-3 rounded-xl bg-amber-50 text-amber-700 text-sm px-3">
      <AlertTriangle size={16} />
      {stage === 'driver' ? 'No items pending for loading.' : 'Items not yet loaded.'}
    </div>
  );

  return (
    <div className="space-y-2.5">
      {showCam && (
        <ScannerModal itemName={nextItem?.products?.product_name || nextItem?.odoo_product_name || 'Next item'}
          onScan={v => { setShowCam(false); submit(v); }} onClose={() => setShowCam(false)} />
      )}
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5">
        <p className="text-xs text-blue-500 font-medium uppercase tracking-wide mb-0.5">Next item</p>
        <p className="text-sm font-bold text-gray-900">{nextItem?.products?.product_name || nextItem?.odoo_product_name}</p>
        {nextItem?.assigned_serial && (
          <p className="text-xs font-mono text-amber-600 mt-0.5">Serial: {nextItem.assigned_serial}</p>
        )}
      </div>
      {/* Scan + input side by side */}
      <div className="flex items-center gap-2">
        <button onClick={() => setShowCam(true)}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors">
          <Camera size={15} /> Scan
        </button>
        <input ref={inputRef} type="text" value={serial}
          onChange={e => setSerial(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit(serial)}
          placeholder="Enter serial number"
          className={`flex-1 px-3 py-2.5 text-sm border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400
            ${fb?.ok === false ? 'border-red-300' : 'border-blue-200'}`}
          disabled={busy} />
        <button onClick={() => submit(serial)} disabled={busy || !serial.trim()}
          className="flex-shrink-0 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl disabled:opacity-40">
          {busy ? <RefreshCw size={14} className="animate-spin" /> : '✓'}
        </button>
      </div>
      <ErrorBanner fb={fb} onDismiss={() => setFb(null)} />
    </div>
  );
}

// ─── Main ScanStation ─────────────────────────────────────────────────────────

export default function ScanStation({ forcedStage }) {
  const { employeeData, loadingPermissions } = useAuth();
  const { isAdmin, isDriver } = useRole(employeeData);

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });

  // ─ role beats forcedStage for non-admin users ──────────────────
  const tabOptions = useMemo(() => {
    const roleKnown = isAdmin || isDriver;
    if (roleKnown && !isAdmin) {
      return [{ id: 'loading', label: 'Loading' }, { id: 'unloading', label: 'Unloading' }];
    }
    // Admin: respect forcedStage or show all
    if (forcedStage === 'unloading') return [{ id: 'unloading', label: 'Unloading' }];
    if (forcedStage === 'driver')    return [{ id: 'loading', label: 'Loading' }, { id: 'unloading', label: 'Unloading' }];
    if (forcedStage === 'audit')     return [{ id: 'audit', label: 'Audit' }];
    if (isAdmin) return [{ id: 'loading', label: 'Loading' }, { id: 'unloading', label: 'Unloading' }];
    return [{ id: 'loading', label: 'Loading' }]; // safe default
  }, [forcedStage, isAdmin, isDriver]);

  // forcedStage determines the initial active tab regardless of role order
  const [tab, setTab] = useState(() => {
    if (forcedStage === 'unloading') return 'unloading';
    if (forcedStage === 'audit')     return 'audit';
    return tabOptions[0].id;
  });

  // Keep tab valid when tabOptions changes (auth loaded async).
  // useLayoutEffect runs before paint so the wrong tab is never shown.
  useLayoutEffect(() => {
    if (!tabOptions.find(t => t.id === tab)) setTab(tabOptions[0].id);
  }, [tabOptions, tab]);

  // Sync tab with forcedStage when prop changes
  useEffect(() => {
    if (forcedStage === 'unloading') setTab('unloading');
    else if (forcedStage === 'driver') setTab('loading');
    else if (forcedStage === 'audit') setTab('audit');
  }, [forcedStage]);

  const orderStatus = tab === 'unloading' ? 'Delivering,Delivered'
    : tab === 'audit'   ? 'all'
    : 'Scheduled,Loaded,Delivering,In Progress,Failed,Delivered';

  // ── Data ─────────────────────────────────────────────────────────────────────

  const [date,     setDate]     = useState(today);
  const [search,   setSearch]   = useState('');
  const [orders,   setOrders]   = useState([]);
  const [fetching, setFetching] = useState(false);
  const orderSnapshot = useRef([]);
  const [changedRoute, setChangedRoute] = useState(null);


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
    return orders.filter(o => !date || orderDate(o) === date);
  }, [orders, date]);

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

  const tabLabel = tab === 'loading' ? 'Loading' : tab === 'unloading' ? 'Unloading' : 'Audit';

  // Global scan — loading and unloading tabs
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
    <div className="flex h-full min-h-0 flex-col bg-gray-50">

      {/* ── Header — sticky within the content scroll area ── */}
      <div className="z-20 shrink-0 bg-gradient-to-r from-blue-800 to-blue-700 shadow-md">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex-shrink-0">
            <p className="text-base font-bold text-white">{tabLabel}</p>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button onClick={() => { fetchOrders(); refetchItems(); }}
              className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 transition-colors" title="Refresh">
              <RefreshCw className="w-4 h-4 text-white" />
            </button>
            {/* Global scan button — loading & unloading only */}
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

      <div className="min-h-0 flex-1 overflow-y-auto">
      {/* Global scanner modal (loading/unloading) */}
      {showGlobalCam && (
        <ScannerModal
          itemName={`Scan item to ${tab === 'loading' ? 'load' : 'unload'}`}
          onScan={v => { setShowGlobalCam(false); setGlobalScanSerial(v); setTimeout(() => setGlobalScanSerial(null), 200); }}
          onClose={() => setShowGlobalCam(false)}
        />
      )}

      {/* ── Date strip ─────────────────────────────────────────────── */}
      <DateStrip selected={date} onChange={d => setDate(d)} />
      {changedRoute && <div role="alert" className="mx-4 my-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
        Route changed after loading started. The previous loading order is still shown.
        <button type="button" className="mt-2 block min-h-10 rounded-lg bg-amber-100 px-3 font-semibold" onClick={() => { orderSnapshot.current = changedRoute; setOrders(changedRoute); setChangedRoute(null); }}>Use updated loading order</button>
      </div>}

      {/* ── Filter bar ─────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 max-w-5xl mx-auto">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search DO, customer, item or serial…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
          </div>

        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 py-4 sm:px-6 sm:py-5">
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
              <AuditTable rows={rows} isAdmin={isAdmin} onUpdated={updateItem} />
            ) : (
              <ItemTable
                rows={rows}
                allRows={allRows}
                isFiltered={Boolean(search)}
                tab={tab}
                employeeId={employeeData?.id || null}
                isAdmin={isAdmin}
                onUpdated={updateItem}
                globalScanSerial={globalScanSerial}
                onGlobalScanError={setGlobalError}
              />
            )}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
