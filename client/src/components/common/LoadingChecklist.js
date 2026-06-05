/**
 * LoadingChecklist — Read-only status display for warehouse and delivery schedules.
 *
 * Shows picking/loading status per item. Scanning is done in Scan Station.
 * The dispatch gate (driver) blocks departure until all items are loaded.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Package, CheckCircle, Clock, Truck, AlertTriangle,
  RefreshCw, ChevronDown, ChevronUp, User
} from 'lucide-react';

const API_BASE = process.env.REACT_APP_API_BASE_URL || '';

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

// ── Item status row (read-only) ───────────────────────────────────────────────
function ItemStatusRow({ item, stage, idx }) {
  const status    = item.picking_status || 'pending';
  const isLoaded  = status === 'loaded';
  const isPicked  = status === 'picked';
  const isPending = status === 'pending';
  const isWaiting = stage === 'driver' && isPending;

  const name = item.products?.product_name || `Item #${item.id}`;

  const isUnloaded = status === 'unloaded';

  const byName = isUnloaded ? item.unloaded_by_name
               : isLoaded   ? item.loaded_by_name
               : isPicked   ? item.picked_by_name
               : null;
  const at     = isUnloaded ? item.unloaded_at
               : isLoaded   ? item.loaded_at
               : isPicked   ? item.picked_at
               : null;
  const serial = isUnloaded ? item.unloaded_serial
               : isLoaded   ? item.loaded_serial
               : isPicked   ? item.picked_serial
               : null;

  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 ${
      isLoaded  ? 'bg-green-50'  :
      isPicked  ? 'bg-blue-50'   :
      isWaiting ? 'bg-gray-50'   : 'bg-white'
    }`}>
      {/* Circle number */}
      <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${
        isLoaded  ? 'bg-green-200 text-green-800' :
        isPicked  ? 'bg-blue-200 text-blue-800'   :
                    'bg-gray-200 text-gray-500'
      }`}>
        {idx + 1}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${
          isPending ? 'text-gray-400' : 'text-gray-900'
        }`}>
          {name}
          <span className="ml-1.5 text-xs text-gray-400 font-normal">×{item.quantity || 1}</span>
        </p>

        {/* Status details */}
        {byName && (
          <p className={`text-xs flex items-center gap-1 mt-0.5 ${
            isUnloaded ? 'text-purple-600' : isLoaded ? 'text-green-600' : 'text-blue-500'
          }`}>
            <User size={9} />
            {isUnloaded ? 'Unloaded' : isLoaded ? 'Loaded' : 'Picked'} by {byName}
            {at && ` · ${formatDateTime(at)}`}
            {serial && (
              <span className={`font-mono ml-1 px-1 py-0.5 rounded text-xs ${
                isUnloaded ? 'bg-purple-100' : isLoaded ? 'bg-green-100' : 'bg-blue-100'
              }`}>
                {serial}
              </span>
            )}
          </p>
        )}

        {isWaiting && (
          <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
            <Clock size={9} /> Waiting for loading
          </p>
        )}

        {isPending && !isWaiting && (
          <p className="text-xs text-gray-400 mt-0.5">Not scanned yet</p>
        )}
      </div>

      {/* Status icon */}
      <div className="flex-shrink-0">
        {isUnloaded && <CheckCircle size={15} className="text-purple-500" />}
        {isLoaded   && <CheckCircle size={15} className="text-green-500"  />}
        {isPicked   && <CheckCircle size={15} className="text-blue-400"   />}
        {isPending  && <Clock       size={13} className="text-gray-300"   />}
      </div>
    </div>
  );
}

// ── Main checklist ────────────────────────────────────────────────────────────
export default function LoadingChecklist({ orderId, orderRef, customerName, stage, employeeId }) {
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [expanded,    setExpanded]    = useState(true);
  const [dispatching,    setDispatching]    = useState(false);
  const [dispatchErr,    setDispatchErr]    = useState(null);
  const [dispatched,     setDispatched]     = useState(false);
  const [dispatchedInfo, setDispatchedInfo] = useState(null); // { name, at }

  const fetchStatus = useCallback(async () => {
    try {
      const res  = await fetch(`${API_BASE}/api/orders/${orderId}/loading-status`);
      const json = await res.json();
      setData(json);
      // Restore dispatched state from API if already delivered/dispatched
      if (json.order_status === 'Delivered' && !dispatched) {
        setDispatched(true);
        if (json.delivered_by_name && !dispatchedInfo) {
          setDispatchedInfo({ name: json.delivered_by_name, at: json.delivered_at });
        }
      }
      if (json.order_status === 'Delivering' && !dispatched && stage === 'driver') {
        // Truck already dispatched — mark dispatch as done for the loading stage
        setDispatched(true);
      }
    } catch { /* silent */ }
    finally  { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, stage]);

  // Poll every 15s so status updates from Scan Station are reflected here
  useEffect(() => {
    fetchStatus();
    const t = setInterval(fetchStatus, 15000);
    return () => clearInterval(t);
  }, [fetchStatus]);

  const handleDispatch = async () => {
    setDispatching(true); setDispatchErr(null);
    try {
      const res  = await fetch(`${API_BASE}/api/orders/${orderId}/dispatch`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: employeeId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Dispatch failed');
      setDispatched(true);
      setDispatchedInfo({
        name: json.dispatched_by_name || 'Unknown',
        at:   json.dispatched_at || new Date().toISOString(),
      });
    } catch (err) {
      setDispatchErr(err.message);
    } finally {
      setDispatching(false);
    }
  };

  const items      = data?.items     || [];
  const pickedCnt  = data?.picked_count || 0;
  const loadedCnt  = data?.loaded_count || 0;
  const total      = data?.total        || 0;
  const allPicked  = data?.all_picked   || false;
  const allLoaded  = data?.all_loaded   || false;

  const unloadedCnt  = data?.unloaded_count || 0;
  const allUnloaded  = data?.all_unloaded  || false;

  const isUnloading  = stage === 'unloading';
  const stageCount   = stage === 'warehouse' ? pickedCnt
                     : isUnloading           ? unloadedCnt
                     :                         loadedCnt;
  const allDone      = stage === 'warehouse' ? allPicked
                     : isUnloading           ? allUnloaded
                     :                         allLoaded;
  const pct          = total > 0 ? Math.round((stageCount / total) * 100) : 0;

  const barColor = stage === 'warehouse' ? (allDone ? 'bg-blue-500'   : 'bg-blue-400')
                 : isUnloading           ? (allDone ? 'bg-purple-500' : 'bg-purple-400')
                 :                         (allDone ? 'bg-green-500'  : 'bg-green-400');

  const headerBorder = allDone
    ? (stage === 'warehouse' ? 'border-blue-200' : isUnloading ? 'border-purple-200' : 'border-green-200')
    : 'border-gray-200';

  return (
    <div className={`rounded-xl border overflow-hidden ${headerBorder} bg-white mb-2`}>
      {/* Header — tap to expand */}
      <div
        className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-gray-50"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Package size={14} className="text-gray-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800 truncate">
              {orderRef || orderId?.slice(0, 8).toUpperCase()}
              {customerName && <span className="ml-1.5 text-gray-400 font-normal">{customerName}</span>}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs text-gray-400">
                {stageCount}/{total} {stage === 'warehouse' ? 'picked' : isUnloading ? 'unloaded' : 'loaded'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          {allDone && <CheckCircle size={14} className={stage === 'warehouse' ? 'text-blue-500' : 'text-green-500'} />}
          {expanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
        </div>
      </div>

      {/* Item list */}
      {expanded && (
        <div className="border-t border-gray-100 divide-y divide-gray-100">
          {loading ? (
            <div className="flex items-center justify-center py-4 text-gray-400 gap-2 text-xs">
              <RefreshCw size={12} className="animate-spin" /> Loading...
            </div>
          ) : items.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-3">No items</p>
          ) : (
            items.map((item, idx) => (
              <ItemStatusRow key={item.id} item={item} stage={stage} idx={idx} />
            ))
          )}

          {/* Mark Delivered — unloading stage only */}
          {isUnloading && items.length > 0 && (
            <div className="px-3 py-3">
              {dispatchErr && (
                <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 px-2 py-1.5 rounded-lg mb-2">
                  <AlertTriangle size={12} /> {dispatchErr}
                </div>
              )}
              {dispatched ? (
                /* Already delivered — permanently show done state */
                <div className="w-full py-3 rounded-xl bg-purple-100 text-center">
                  <p className="text-sm font-bold text-purple-700 flex items-center justify-center gap-2">
                    <CheckCircle size={16} /> Done Delivered
                  </p>
                  {dispatchedInfo && (
                    <p className="text-xs text-purple-600 mt-0.5">
                      by {dispatchedInfo.name} · {formatDateTime(dispatchedInfo.at)}
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <button
                    onClick={async () => {
                      setDispatching(true); setDispatchErr(null);
                      try {
                        const res  = await fetch(`${API_BASE}/api/orders/${orderId}/deliver`, {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ employee_id: employeeId }),
                        });
                        const json = await res.json();
                        if (!res.ok) throw new Error(json.error || 'Failed');
                        setDispatched(true);
                        setDispatchedInfo({ name: json.delivered_by_name || 'Unknown', at: json.delivered_at || new Date().toISOString() });
                      } catch (err) { setDispatchErr(err.message); }
                      finally { setDispatching(false); }
                    }}
                    disabled={!allUnloaded || dispatching}
                    className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${
                      allUnloaded
                        ? 'bg-purple-600 hover:bg-purple-700 text-white'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {dispatching ? (
                      <span className="flex items-center justify-center gap-2"><RefreshCw size={13} className="animate-spin" /> Marking...</span>
                    ) : allUnloaded ? (
                      <span className="flex items-center justify-center gap-2"><CheckCircle size={14} /> Mark as Delivered</span>
                    ) : (
                      `${total - (data?.unloaded_count || 0)} item${total - (data?.unloaded_count || 0) > 1 ? 's' : ''} not yet unloaded`
                    )}
                  </button>
                  {!allUnloaded && (
                    <p className="text-xs text-center text-gray-400 mt-1.5">Scan all items in Unloading tab first</p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Dispatch button — driver only */}
          {stage === 'driver' && !dispatched && items.length > 0 && (
            <div className="px-3 py-3">
              {dispatchErr && (
                <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 px-2 py-1.5 rounded-lg mb-2">
                  <AlertTriangle size={12} /> {dispatchErr}
                </div>
              )}
              <button
                onClick={handleDispatch}
                disabled={!allLoaded || dispatching}
                className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  allLoaded
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                {dispatching ? (
                  <span className="flex items-center justify-center gap-2">
                    <RefreshCw size={13} className="animate-spin" /> Dispatching...
                  </span>
                ) : allLoaded ? (
                  <span className="flex items-center justify-center gap-2">
                    <Truck size={14} /> Ready to Dispatch
                  </span>
                ) : (
                  `Dispatch blocked — ${total - loadedCnt} item${total - loadedCnt > 1 ? 's' : ''} not loaded`
                )}
              </button>
              {!allLoaded && (
                <p className="text-xs text-center text-gray-400 mt-1.5">
                  Complete loading in Scan Station first
                </p>
              )}
            </div>
          )}

          {stage === 'driver' && dispatched && (
            <div className="flex flex-col items-center justify-center gap-1 py-3 text-green-700 text-sm font-medium">
              <span className="flex items-center gap-2">
                <Truck size={14} /> Dispatched — En Route
              </span>
              {dispatchedInfo && (
                <span className="text-xs text-green-600 font-normal">
                  by {dispatchedInfo.name} · {formatDateTime(dispatchedInfo.at)}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
