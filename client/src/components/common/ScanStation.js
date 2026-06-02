/**
 * ScanStation — A2 Truck Loading Enforcement
 *
 * Demo scanner for CE Hub. In production, Odoo's WMS handles physical scanning.
 * CE Hub displays item status and blocks dispatch until all items are confirmed.
 *
 * Roles:
 *   Warehouse / Storekeeper → Picking mode only
 *   Delivery / Driver       → Loading mode only
 *   Admin                   → Toggle between both modes
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Camera, Package, CheckCircle, Clock, Truck,
  RefreshCw, User, MapPin, Search, AlertTriangle,
  ChevronDown, ChevronUp
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import ScannerModal from './ScannerModal';

const API_BASE = process.env.REACT_APP_API_BASE_URL ||
  window.location.origin.replace(/:\d+$/, ':4000');

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDateTime(str) {
  if (!str) return '';
  const d   = new Date(str);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (isToday) {
    return d.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleString('en-MY', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}

function useRole(employeeData) {
  const name = (employeeData?.role?.name || employeeData?.role || '').toString().toLowerCase();
  const isAdmin     = name.includes('admin');
  const isWarehouse = name.includes('warehouse') || name.includes('storekeeper');
  const isDriver    = name.includes('delivery') || name.includes('driver');
  return { isAdmin, isWarehouse, isDriver };
}

function stageMeta(stage) {
  if (stage === 'warehouse') return { label: 'Picking',   action: 'picking',   apiStage: 'picking',   nextStatus: 'pending',  canStatus: 'pending'  };
  if (stage === 'driver')    return { label: 'Loading',   action: 'loading',   apiStage: 'loading',   nextStatus: 'picked',   canStatus: 'picked'   };
  /* unloading */             return { label: 'Unloading', action: 'unloading', apiStage: 'unloading', nextStatus: 'loaded',   canStatus: 'loaded'   };
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusPill({ status }) {
  const map = {
    pending: { label: 'Not Scanned', cls: 'bg-gray-100 text-gray-500',   dot: 'bg-gray-300'   },
    picked:  { label: 'Picked',      cls: 'bg-blue-100 text-blue-700',   dot: 'bg-blue-500'   },
    loaded:  { label: 'Loaded',      cls: 'bg-green-100 text-green-700', dot: 'bg-green-500'  },
  };
  const { label, cls, dot } = map[status] || map.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

// ── Scanner section for one order ─────────────────────────────────────────────
function ScannerSection({ order, stage, employeeId, items, onItemUpdated }) {
  const [serial,      setSerial]      = useState('');
  const [showCamera,  setShowCamera]  = useState(false);
  const [feedback,    setFeedback]    = useState(null); // { msg, ok, item }
  const [submitting,  setSubmitting]  = useState(false);
  const inputRef = useRef(null);

  const isWarehouse  = stage === 'warehouse';
  const isUnloading  = stage === 'unloading';
  const meta         = stageMeta(stage);

  // Next item that needs action based on stage
  const canScanStatus = meta.canStatus;
  const nextItem = items.find(i => i.picking_status === canScanStatus);
  const allDone  = !nextItem;

  const submitSerial = useCallback(async (value) => {
    if (!value?.trim() || !nextItem) return;
    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch(`${API_BASE}/api/order-products/${nextItem.id}/picking-status`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          stage:         meta.apiStage,
          employee_id:   employeeId || null,
          serial_number: value.trim(),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        // Serial mismatch or other error
        setFeedback({
          ok:   false,
          msg:  data.error || 'Failed',
          code: data.code,
          expected: data.expected,
          scanned:  data.scanned,
        });
        return;
      }

      // Success
      onItemUpdated(data.orderProduct);
      setSerial('');
      const actionLabel = isWarehouse ? 'Picked' : isUnloading ? 'Unloaded' : 'Loaded';
      setFeedback({
        ok:   true,
        msg:  `✓ ${data.orderProduct.products?.product_name || 'Item'} — ${actionLabel}`,
        serial: value.trim(),
      });
      setTimeout(() => setFeedback(null), 4000);
      inputRef.current?.focus();
    } catch (err) {
      setFeedback({ ok: false, msg: err.message });
    } finally {
      setSubmitting(false);
    }
  }, [nextItem, isWarehouse, employeeId, onItemUpdated]);

  const handleCameraScan = (scannedValue) => {
    setShowCamera(false);
    setSerial(scannedValue);
    submitSerial(scannedValue);
  };

  const stageBtn = 'bg-blue-600 hover:bg-blue-700';

  return (
    <div className="bg-white rounded-2xl border border-blue-200 shadow-sm overflow-hidden">
      {showCamera && (
        <ScannerModal
          itemName={nextItem?.products?.product_name || 'Next item'}
          onScan={handleCameraScan}
          onClose={() => setShowCamera(false)}
        />
      )}

      {/* Counter badge */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50">
        <p className="text-xs font-semibold text-gray-600">
          {isWarehouse ? 'Picking' : isUnloading ? 'Unloading' : 'Loading'} progress
        </p>
        <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
          {items.filter(i =>
            isWarehouse  ? ['picked','loaded','unloaded'].includes(i.picking_status) :
            isUnloading  ? i.picking_status === 'unloaded' :
                           ['loaded','unloaded'].includes(i.picking_status)
          ).length} / {items.length}
        </span>
      </div>

      <div className="p-4 space-y-4">
        {allDone ? (
          /* All items confirmed */
          <div className="flex items-center justify-center gap-3 py-4 rounded-xl bg-blue-50 text-blue-700">
            <CheckCircle size={20} />
            <span className="font-semibold text-sm">
              All items {isWarehouse ? 'picked' : 'loaded'} ✓
            </span>
          </div>
        ) : (
          <>
            {/* Next item indicator */}
            <div className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">Next item</p>
              <p className="text-base font-bold text-gray-900">
                {nextItem?.products?.product_name || 'Unknown item'}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Qty: {nextItem?.quantity || 1}
                {nextItem?.assigned_serial && (
                  <span className="ml-2 font-mono text-amber-600 font-semibold">
                    Expected serial: {nextItem.assigned_serial}
                  </span>
                )}
              </p>
            </div>

            {/* Camera button */}
            <button
              onClick={() => setShowCamera(true)}
              className={`w-full flex items-center justify-center gap-2 py-3 text-white font-semibold rounded-xl transition-all active:scale-98 ${stageBtn}`}
            >
              <Camera size={18} />
              Open Camera Scanner
            </button>

            <div className="flex items-center gap-2 text-xs text-gray-400">
              <div className="flex-1 h-px bg-gray-200" />
              or enter manually
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            {/* Manual serial input */}
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={serial}
                onChange={e => setSerial(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submitSerial(serial)}
                placeholder="Type or paste serial / barcode number"
                className={`flex-1 px-4 py-3 text-sm border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                  feedback?.ok === false ? 'border-red-300' : 'border-blue-200'
                }`}
                disabled={submitting}
                autoComplete="off"
              />
              <button
                onClick={() => submitSerial(serial)}
                disabled={submitting || !serial.trim()}
                className={`px-5 py-3 text-white font-bold rounded-xl transition-all active:scale-95 disabled:opacity-40 ${stageBtn}`}
              >
                {submitting ? <RefreshCw size={16} className="animate-spin" /> : '✓'}
              </button>
            </div>
          </>
        )}

        {/* Feedback */}
        {feedback && (
          <div className={`flex items-start gap-3 p-3 rounded-xl text-sm ${
            feedback.ok
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {feedback.ok
              ? <CheckCircle size={16} className="flex-shrink-0 mt-0.5" />
              : <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
            }
            <div>
              <p className="font-medium">{feedback.msg}</p>
              {feedback.code === 'SERIAL_MISMATCH' && (
                <p className="text-xs mt-1 opacity-80">
                  Expected: <span className="font-mono font-bold">{feedback.expected}</span>
                  {' '}— Scanned: <span className="font-mono font-bold">{feedback.scanned}</span>
                </p>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ── Item status list (read-only display) ──────────────────────────────────────
function ItemStatusList({ items, loading }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Package size={15} className="text-gray-400" />
          Item Status
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-gray-400 gap-2 text-sm">
          <RefreshCw size={14} className="animate-spin" /> Loading...
        </div>
      ) : !items?.length ? (
        <p className="text-sm text-gray-400 text-center py-8">No items in this order.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {items.map((item, idx) => {
            const status  = item.picking_status || 'pending';
            const name    = item.products?.product_name || `Item #${item.id}`;
            const serial  = status === 'loaded' ? item.loaded_serial
                          : status === 'picked' ? item.picked_serial
                          : null;
            const byName  = status === 'loaded' ? item.loaded_by_name
                          : status === 'picked' ? item.picked_by_name
                          : null;
            const at      = status === 'loaded' ? item.loaded_at
                          : status === 'picked' ? item.picked_at
                          : null;

            return (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                {/* Number */}
                <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${
                  status === 'loaded' ? 'bg-green-100 text-green-700' :
                  status === 'picked' ? 'bg-blue-100 text-blue-700'   :
                                        'bg-gray-100 text-gray-400'
                }`}>
                  {idx + 1}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold truncate ${
                    status === 'pending' ? 'text-gray-400' : 'text-gray-900'
                  }`}>
                    {name}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                    <span className="text-xs text-gray-400">×{item.quantity || 1}</span>
                    {item.assigned_serial && (
                      <span className="text-xs font-mono text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                        assigned: {item.assigned_serial}
                      </span>
                    )}
                    {byName && (
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <User size={9} />
                        {byName}{at ? ` · ${formatDateTime(at)}` : ''}
                      </span>
                    )}
                    {serial && (
                      <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                        status === 'loaded' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'
                      }`}>
                        {serial}
                      </span>
                    )}
                  </div>
                </div>

                {/* Status */}
                <StatusPill status={status} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Order card wrapper ────────────────────────────────────────────────────────
function OrderCard({ order, stage, employeeId }) {
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState(true);

  const isWarehouse = stage === 'warehouse';

  const fetchItems = useCallback(async () => {
    try {
      const res  = await fetch(`${API_BASE}/api/orders/${order.id}/loading-status`);
      const json = await res.json();
      setData(json);
    } catch { /* silent */ }
    finally  { setLoading(false); }
  }, [order.id]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleUpdated = (updated) => {
    setData(prev => {
      if (!prev) return prev;
      const newItems = prev.items.map(i => i.id === updated.id ? { ...i, ...updated } : i);
      return {
        ...prev,
        items:        newItems,
        picked_count: newItems.filter(i => ['picked','loaded'].includes(i.picking_status)).length,
        loaded_count: newItems.filter(i => i.picking_status === 'loaded').length,
        all_picked:   newItems.every(i => ['picked','loaded'].includes(i.picking_status)),
        all_loaded:   newItems.every(i => i.picking_status === 'loaded'),
      };
    });
  };

  const items      = data?.items || [];
  const isUnloading = stage === 'unloading';
  const stageCount  = isWarehouse ? (data?.picked_count || 0)
                    : isUnloading ? (data?.unloaded_count || 0)
                    :               (data?.loaded_count  || 0);
  const total    = data?.total || 0;
  const allDone  = isWarehouse ? data?.all_picked
                : isUnloading  ? data?.all_unloaded
                :                data?.all_loaded;
  const pct        = total > 0 ? Math.round((stageCount / total) * 100) : 0;

  return (
    <div className={`rounded-2xl border shadow-sm overflow-hidden ${
      allDone
        ? (isWarehouse ? 'border-blue-200' : 'border-green-200')
        : 'border-gray-200'
    } bg-white`}>

      {/* Order header */}
      <div
        className="flex items-center justify-between px-4 py-3 sm:px-5 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold text-gray-900">
              {order.odoo_order_ref || order.id.slice(0, 8).toUpperCase()}
            </span>
            {allDone && (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                isWarehouse ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
              }`}>
                {isWarehouse ? 'All Picked ✓' : 'All Loaded ✓'}
              </span>
            )}
          </div>
          {order.customers?.full_name && (
            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
              <User size={10} className="text-gray-400" />
              {order.customers.full_name}
            </p>
          )}
          {order.delivery_address && (
            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1 truncate">
              <MapPin size={10} className="flex-shrink-0" />
              <span className="truncate">{order.delivery_address}</span>
            </p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <div className="w-24 sm:w-36 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${isWarehouse ? 'bg-blue-500' : 'bg-green-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-gray-400">
              {stageCount}/{total} {isWarehouse ? 'picked' : 'loaded'}
            </span>
          </div>
        </div>
        <div className="ml-3 flex-shrink-0">
          {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </div>
      </div>

      {/* Expanded: scanner + status */}
      {expanded && (
        <div className="border-t border-gray-100 p-4 sm:p-5 space-y-4 bg-gray-50">
          {/* Scanner section */}
          <ScannerSection
            order={order}
            stage={stage}
            employeeId={employeeId}
            items={items}
            onItemUpdated={handleUpdated}
          />
          {/* Status display */}
          <ItemStatusList items={items} loading={loading} />
        </div>
      )}
    </div>
  );
}

// ── Main ScanStation ──────────────────────────────────────────────────────────
export default function ScanStation({ forcedStage }) {
  const { employeeData } = useAuth();
  const { isAdmin, isWarehouse, isDriver } = useRole(employeeData);

  // forcedStage comes from Layout tab; falls back to role detection
  const defaultStage = forcedStage || (isWarehouse ? 'warehouse' : 'driver');
  const [stage] = useState(defaultStage);
  const [orders,  setOrders]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      // Unloading: orders are Delivering (truck already dispatched)
      // Picking / Loading: orders are Scheduled
      const statusFilter = stage === 'unloading' ? 'Delivering' : 'Scheduled';
      const res  = await fetch(
        `${API_BASE}/api/orders?status=${statusFilter}&sort=created_desc&include_products=true`
      );
      const data = await res.json();
      setOrders(Array.isArray(data) ? data : []);
    } catch { /* silent */ }
    finally  { setLoading(false); }
  }, [stage]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const filtered = orders.filter(o => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      o.odoo_order_ref?.toLowerCase().includes(s) ||
      o.customers?.full_name?.toLowerCase().includes(s) ||
      o.delivery_address?.toLowerCase().includes(s)
    );
  });

  const isPickingMode = stage === 'warehouse';

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Search bar only */}
      <div className="px-4 pt-3 pb-2 sm:px-6 bg-white border-b border-gray-200">
        <div className="flex items-center gap-2 max-w-2xl mx-auto">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by order, customer or address..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <button onClick={fetchOrders} className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-500">
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* Order list */}
      <div className="max-w-2xl mx-auto px-4 py-4 sm:px-6 sm:py-5 space-y-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
            <RefreshCw size={32} className="animate-spin" />
            <p className="text-sm">Loading scheduled orders...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
            {isPickingMode ? <Package size={48} className="opacity-20" /> : <Truck size={48} className="opacity-20" />}
            <p className="text-base font-medium text-gray-500">No scheduled orders</p>
            <p className="text-sm text-center max-w-xs text-gray-400">
              {search ? 'No orders match your search.' : 'Orders scheduled by admin will appear here.'}
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium px-1">
              {filtered.length} order{filtered.length !== 1 ? 's' : ''} —
              {isPickingMode ? ' Picking mode' : ' Loading mode'} · tap to expand
            </p>
            {filtered.map(order => (
              <OrderCard
                key={order.id}
                order={order}
                stage={stage}
                employeeId={employeeData?.id || null}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
