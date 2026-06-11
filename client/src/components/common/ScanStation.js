/**
 * ScanStation — A2 Truck Loading Enforcement (v3)
 *
 * Warehouse → Picking only (no tabs)
 * Driver    → Loading / Unloading toggle (in filter bar, not header)
 * Admin     → Warehouse View / Driver View selector
 */

import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  Camera, Package,
  RefreshCw,
  Search,
  Truck,
  User,
  XCircle,
} from 'lucide-react';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { API_BASE_URL as API_BASE } from '../../utils/apiBaseUrl';
import ScannerModal from './ScannerModal';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(str) {
  if (!str) return '';
  const d = new Date(str);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleString('en-MY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function orderDate(order) {
  const dt = order.scheduled_start_date_time || order.actual_start_date_time;
  return dt ? new Date(dt).toLocaleDateString('en-CA') : '';
}

function useRole(employeeData) {
  const n = (employeeData?.role?.name || employeeData?.role || '').toString().toLowerCase();
  return {
    isAdmin:     n.includes('admin'),
    isWarehouse: n.includes('warehouse') || n.includes('storekeeper'),
    isDriver:    n.includes('delivery')  || n.includes('driver'),
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
    <div className="bg-white border-b border-gray-200 px-2 py-2 flex gap-1 overflow-x-auto scrollbar-hide">
      {strip.map(({ key, day, date }) => (
        <button key={key} onClick={() => onChange(key)}
          className={`flex flex-col items-center min-w-[44px] py-1.5 rounded-xl transition-colors flex-shrink-0
            ${key === selected ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
          <span className="text-xs">{day}</span>
          <span className={`text-base font-semibold ${key === today && key !== selected ? 'text-blue-600' : ''}`}>{date}</span>
        </button>
      ))}
      <button onClick={() => dateRef.current?.showPicker?.()}
        className="flex flex-col items-center min-w-[44px] py-1.5 text-gray-400 hover:text-gray-600 flex-shrink-0">
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
  const status = item?.picking_status || 'pending';
  const cfg = {
    pending:  { label: 'Pending',  cls: 'bg-gray-100 text-gray-500',       dot: 'bg-gray-400'    },
    picked:   { label: 'Picked',   cls: 'bg-blue-100 text-blue-700',       dot: 'bg-blue-500'    },
    loaded:   { label: 'Loaded',   cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
    unloaded: { label: 'Unloaded', cls: 'bg-purple-100 text-purple-700',   dot: 'bg-purple-500'  },
  };
  const { label, cls, dot } = cfg[status] || cfg.pending;

  const byName = status === 'unloaded' ? item.unloaded_by_name
               : status === 'loaded'   ? item.loaded_by_name
               : status === 'picked'   ? item.picked_by_name : null;
  const at     = status === 'unloaded' ? item.unloaded_at
               : status === 'loaded'   ? item.loaded_at
               : status === 'picked'   ? item.picked_at : null;

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

// ─── Serial badge ─────────────────────────────────────────────────────────────

function SerialBadge({ label, value, color }) {
  const colors = {
    amber:   'bg-amber-50 text-amber-700 border-amber-200',
    blue:    'bg-blue-50 text-blue-700 border-blue-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    purple:  'bg-purple-50 text-purple-700 border-purple-200',
  };
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-gray-400 w-14 flex-shrink-0">{label}:</span>
      <span className={`font-mono text-xs px-1.5 py-0.5 rounded border ${colors[color] || colors.amber}`}>
        {value}
      </span>
    </div>
  );
}

// ─── Error-only feedback ──────────────────────────────────────────────────────

function ErrorBanner({ fb, onDismiss }) {
  if (!fb || fb.ok) return null;
  return (
    <div className="flex items-start gap-2.5 p-3 rounded-xl text-sm bg-red-50 text-red-700 border border-red-200">
      <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="font-medium">{fb.msg}</p>
        {fb.code === 'SERIAL_MISMATCH' && (
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

async function submitScan({ itemId, stage, employeeId, serialNumber }) {
  const res  = await fetch(`${API_BASE}/api/order-products/${itemId}/picking-status`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ stage, employee_id: employeeId || null, serial_number: serialNumber.trim() }),
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
          picked_count:   items.filter(i => ['picked','loaded','unloaded'].includes(i.picking_status)).length,
          loaded_count:   items.filter(i => ['loaded','unloaded'].includes(i.picking_status)).length,
          unloaded_count: items.filter(i => i.picking_status === 'unloaded').length,
          all_picked:     items.every(i => ['picked','loaded','unloaded'].includes(i.picking_status)),
          all_loaded:     items.every(i => ['loaded','unloaded'].includes(i.picking_status)),
          all_unloaded:   items.every(i => i.picking_status === 'unloaded'),
        },
      };
    });
  }, []);

  return { itemMap, loadingItems: loading, refetchItems: fetchAll, updateItem };
}

// ─── Item Table ───────────────────────────────────────────────────────────────

function ItemTable({ rows, tab, employeeId, isAdmin, onUpdated, globalScanSerial, onGlobalScanError }) {
  const [rowFb,      setRowFb]      = useState({});
  const [busy,       setBusy]       = useState({});
  const [rowCam,     setRowCam]     = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [sort,        setSort]        = useState({ field: 'so', dir: 'asc' });

  const apiStage   = tab === 'picking' ? 'picking' : tab === 'loading' ? 'loading' : 'unloading';
  const needStatus = tab === 'picking' ? 'pending' : tab === 'loading' ? 'picked' : 'loaded';

  // Handle global scan (loading / unloading only)
  useEffect(() => {
    if (!globalScanSerial || !rows.length || tab === 'picking') return;
    const serial = globalScanSerial.trim();
    const match = rows.find(r =>
      tab === 'loading'
        ? r.picking_status === 'picked'  && r.picked_serial  === serial
        : r.picking_status === 'loaded'  && r.loaded_serial  === serial
    ) || rows.find(r => r.picking_status === needStatus);
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
    const stageToCancel = { picked: 'picking', loaded: 'loading', unloaded: 'unloading' };
    const stage = stageToCancel[item.picking_status];
    if (!stage || !window.confirm(`Cancel ${stage} scan for "${item.products?.product_name}"?`)) return;
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

  // Sorting inside the table
  const handleSort = (field) =>
    setSort(prev => prev.field === field ? { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' });

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      let va, vb;
      if (sort.field === 'so')     { va = a._order?.odoo_order_ref || a._order?.id || ''; vb = b._order?.odoo_order_ref || b._order?.id || ''; }
      else if (sort.field === 'name')   { va = a.products?.product_name || ''; vb = b.products?.product_name || ''; }
      else if (sort.field === 'serial') {
        const displaySerial = r => tab === 'picking' ? (r.picked_serial || r.assigned_serial)
                                 : tab === 'loading' ? (r.loaded_serial || r.picked_serial)
                                 : (r.unloaded_serial || r.loaded_serial);
        va = displaySerial(a) || ''; vb = displaySerial(b) || '';
      }
      else if (sort.field === 'status') { const o = ['pending','picked','loaded','unloaded']; va = o.indexOf(a.picking_status); vb = o.indexOf(b.picking_status); return sort.dir === 'asc' ? va - vb : vb - va; }
      else return 0;
      const c = String(va).localeCompare(String(vb), undefined, { numeric: true });
      return sort.dir === 'asc' ? c : -c;
    });
  }, [rows, sort]);

  if (!sorted.length) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Mobile sort strip — column headers are hidden on small screens */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-gray-100 bg-gray-50 md:hidden flex-wrap">
        <span className="text-xs text-gray-400 font-medium">Sort:</span>
        {[{ id: 'so', label: 'SO' }, { id: 'serial', label: 'Serial' }, { id: 'name', label: 'Name' }, { id: 'status', label: 'Status' }].map(f => {
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
              <SortTh field="so"     sort={sort} onSort={handleSort} className="hidden sm:table-cell">SO Number</SortTh>
              <SortTh field="serial" sort={sort} onSort={handleSort} className="hidden md:table-cell">Serial No.</SortTh>
              <SortTh field="status" sort={sort} onSort={handleSort}>Status</SortTh>
              {tab === 'picking' && (
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-52">Action</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map((row, idx) => {
              const isActionable = row.picking_status === needStatus;
              const fb = rowFb[row.id];

              return (
                <React.Fragment key={row.id}>
                  <tr className={`transition-colors ${isActionable ? 'bg-blue-50/40' : 'hover:bg-gray-50'}`}>

                    {/* # */}
                    <td className="px-4 py-3 text-gray-400 text-xs font-medium">{idx + 1}</td>

                    {/* Item Name */}
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{row.products?.product_name || `Item #${row.id}`}</p>
                      <p className="text-xs text-gray-400">×{row.quantity || 1}</p>
                      {/* SO inline on mobile */}
                      <p className="text-xs font-mono text-gray-500 sm:hidden mt-0.5">
                        {row._order?.odoo_order_ref || row._order?.id?.slice(0,8).toUpperCase()}
                      </p>
                      {/* Serial inline on mobile */}
                      {(() => {
                        const s = tab === 'picking' ? (row.picked_serial || row.assigned_serial)
                                : tab === 'loading' ? (row.loaded_serial || row.picked_serial)
                                : (row.unloaded_serial || row.loaded_serial);
                        const cls = tab === 'picking' ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : tab === 'loading' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-purple-50 text-purple-700 border-purple-200';
                        return s ? (
                          <span className={`md:hidden inline-block font-mono text-xs px-1.5 py-0.5 rounded border mt-0.5 ${cls}`}>{s}</span>
                        ) : null;
                      })()}
                    </td>

                    {/* SO Number */}
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="font-mono text-xs font-bold text-gray-700">
                        {row._order?.odoo_order_ref || row._order?.id?.slice(0,8).toUpperCase()}
                      </span>
                      {row._order?.customers?.full_name && (
                        <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                          <User size={9} />{row._order.customers.full_name}
                        </p>
                      )}
                    </td>

                    {/* Serial No. — one value, most relevant for current tab */}
                    <td className="px-4 py-3 hidden md:table-cell">
                      {(() => {
                        const serial =
                          tab === 'picking'   ? (row.picked_serial   || row.assigned_serial) :
                          tab === 'loading'   ? (row.loaded_serial   || row.picked_serial)  :
                                               (row.unloaded_serial  || row.loaded_serial);
                        const color =
                          tab === 'picking'   ? 'bg-amber-50 text-amber-700 border-amber-200'   :
                          tab === 'loading'   ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                               'bg-purple-50 text-purple-700 border-purple-200';
                        return serial
                          ? <span className={`font-mono text-xs px-2 py-0.5 rounded border ${color}`}>{serial}</span>
                          : <span className="text-xs text-gray-300">—</span>;
                      })()}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <StatusPill item={row} />
                        {isAdmin && row.picking_status !== 'pending' && (
                          <button
                            onClick={() => handleCancelScan(row, row._orderId)}
                            disabled={cancelling === row.id}
                            className="text-red-400 hover:text-red-600 transition-colors disabled:opacity-40"
                            title="Cancel scan"
                          >
                            {cancelling === row.id
                              ? <RefreshCw size={11} className="animate-spin" />
                              : <XCircle size={11} />}
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Action — picking only; loading/unloading use the global Scan button in header */}
                    {tab === 'picking' && (
                    <td className="px-4 py-3">
                      {rowCam === row.id && (
                        <ScannerModal
                          itemName={row.products?.product_name || 'Item'}
                          onScan={v => { setRowCam(null); handleSubmit(row.id, row._orderId, v); }}
                          onClose={() => setRowCam(null)}
                        />
                      )}
                      {isActionable ? (
                        <button
                          onClick={() => setRowCam(row.id)}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors"
                        >
                          <Camera size={12} /> Scan
                        </button>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    )}
                  </tr>

                  {/* Error feedback row */}
                  {fb && !fb.ok && (
                    <tr className="border-0">
                      <td colSpan={6} className="px-4 pb-2 pt-0">
                        <ErrorBanner fb={fb} onDismiss={() => setRowFb(p => ({ ...p, [row.id]: null }))} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
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

  const apiStage   = stage === 'warehouse' ? 'picking' : stage === 'driver' ? 'loading' : 'unloading';
  const canStatus  = stage === 'warehouse' ? 'pending' : stage === 'driver' ? 'picked' : 'loaded';
  const doneStatus = stage === 'warehouse' ? ['picked','loaded','unloaded'] : stage === 'driver' ? ['loaded','unloaded'] : ['unloaded'];
  const doneLabel  = stage === 'warehouse' ? 'Picked' : stage === 'driver' ? 'Loaded' : 'Unloaded';

  const nextItem  = items.find(i => i.picking_status === canStatus);
  const allDone   = items.length > 0 && items.every(i => doneStatus.includes(i.picking_status));
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
      {stage === 'driver' ? 'Items not yet picked.' : 'Items not yet loaded.'}
    </div>
  );

  return (
    <div className="space-y-2.5">
      {showCam && (
        <ScannerModal itemName={nextItem?.products?.product_name || 'Next item'}
          onScan={v => { setShowCam(false); submit(v); }} onClose={() => setShowCam(false)} />
      )}
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5">
        <p className="text-xs text-blue-500 font-medium uppercase tracking-wide mb-0.5">Next item</p>
        <p className="text-sm font-bold text-gray-900">{nextItem?.products?.product_name}</p>
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
  const { employeeData } = useAuth();
  const { isAdmin, isWarehouse, isDriver } = useRole(employeeData);

  const today = new Date().toLocaleDateString('en-CA');

  // ─ role beats forcedStage for non-admin users ──────────────────
  const tabOptions = useMemo(() => {
    const roleKnown = isAdmin || isWarehouse || isDriver;
    if (roleKnown && !isAdmin) {
      if (isWarehouse && !isDriver) return [{ id: 'picking', label: 'Picking' }];
      if (isDriver && !isWarehouse) return [{ id: 'loading', label: 'Loading' }, { id: 'unloading', label: 'Unloading' }];
    }
    // Admin: respect forcedStage or show all three
    if (forcedStage === 'warehouse') return [{ id: 'picking',   label: 'Picking'   }];
    if (forcedStage === 'unloading') return [{ id: 'unloading', label: 'Unloading' }];
    if (forcedStage === 'driver')    return [{ id: 'loading', label: 'Loading' }, { id: 'unloading', label: 'Unloading' }];
    if (isAdmin) return [{ id: 'picking', label: 'Picking' }, { id: 'loading', label: 'Loading' }, { id: 'unloading', label: 'Unloading' }];
    return [{ id: 'picking', label: 'Picking' }]; // safe default
  }, [forcedStage, isAdmin, isDriver, isWarehouse]);

  // forcedStage determines the initial active tab regardless of role order
  const [tab, setTab] = useState(() => {
    if (forcedStage === 'unloading') return 'unloading';
    if (forcedStage === 'warehouse') return 'picking';
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
    else if (forcedStage === 'warehouse') setTab('picking');
    else if (forcedStage === 'driver') setTab('loading');
  }, [forcedStage]);

  const orderStatus = tab === 'unloading' ? 'Delivering' : 'Scheduled';

  // ── Data ─────────────────────────────────────────────────────────────────────

  const [date,     setDate]     = useState(today);
  const [search,   setSearch]   = useState('');
  const [orders,   setOrders]   = useState([]);
  const [fetching, setFetching] = useState(false);


  const fetchOrders = useCallback(async () => {
    setFetching(true);
    try {
      const res  = await fetch(`${API_BASE}/api/orders?status=${orderStatus}&sort=scheduled_asc&include_products=true`);
      const data = await res.json();
      setOrders(Array.isArray(data) ? data : []);
    } catch { setOrders([]); }
    finally { setFetching(false); }
  }, [orderStatus]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // Date filter only — search is applied at row level so only matching items show
  const filteredOrders = useMemo(() => {
    return orders.filter(o => !date || orderDate(o) === date);
  }, [orders, date]);

  const { itemMap, loadingItems, updateItem } = useAllOrderItems(filteredOrders);

  const rows = useMemo(() => {
    const allRows = filteredOrders.flatMap(order => {
      const items = itemMap[order.id]?.items || order.order_products || [];
      return items.map(item => ({ ...item, _orderId: order.id, _order: order }));
    });
    if (!search) return allRows;
    const s = search.toLowerCase();
    return allRows.filter(row => {
      const name   = row.products?.product_name?.toLowerCase() || '';
      const so     = row._order?.odoo_order_ref?.toLowerCase() || row._order?.id?.toLowerCase() || '';
      const cust   = row._order?.customers?.full_name?.toLowerCase() || '';
      const serial = [row.assigned_serial, row.picked_serial, row.loaded_serial, row.unloaded_serial]
                       .filter(Boolean).join(' ').toLowerCase();
      return name.includes(s) || so.includes(s) || cust.includes(s) || serial.includes(s);
    });
  }, [filteredOrders, itemMap, search]);

  const tabLabel = tab === 'picking' ? 'Picking' : tab === 'loading' ? 'Loading' : 'Unloading';

  // Global scan — only for loading / unloading (picking uses per-row buttons)
  const [showGlobalCam,    setShowGlobalCam]    = useState(false);
  const [globalScanSerial, setGlobalScanSerial] = useState(null);
  const [globalError,      setGlobalError]      = useState(null);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Header — sticky within the content scroll area ── */}
      <div className="sticky top-0 z-20 bg-gradient-to-r from-blue-800 to-blue-700 shadow-md">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex-shrink-0">
            <p className="text-xs text-blue-200 font-medium">Scan Station</p>
            <p className="text-base font-bold text-white">{tabLabel}</p>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button onClick={fetchOrders}
              className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 transition-colors" title="Refresh">
              <RefreshCw className="w-4 h-4 text-white" />
            </button>
            {/* Global scan button — loading & unloading only */}
            {tab !== 'picking' && (
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

      {/* ── Filter bar ─────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 max-w-5xl mx-auto">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search SO, customer, item or serial…"
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
            {tab === 'picking' ? <Package size={48} className="opacity-20" /> : <Truck size={48} className="opacity-20" />}
            <p className="text-base font-medium text-gray-500">
              {search ? 'No items match your search.' : `No ${tabLabel.toLowerCase()} items for this date.`}
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
            <ItemTable
              rows={rows}
              tab={tab}
              employeeId={employeeData?.id || null}
              isAdmin={isAdmin}
              onUpdated={updateItem}
              globalScanSerial={globalScanSerial}
              onGlobalScanError={setGlobalError}
            />
          </div>
        )}
      </div>
    </div>
  );
}
