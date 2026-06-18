// client/src/components/admin/CompletedDeliveries.js
// FR-04-004: Admin view of completed delivery records.
import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  Image as ImageIcon,
  ExternalLink,
  User,
  Loader2,
} from 'lucide-react';
import { API_BASE_URL as API_BASE } from '../../utils/apiBaseUrl';

function apiFetch(path) {
  return fetch(`${API_BASE.replace(/\/$/, '')}/api/${path.replace(/^\/+/, '')}`, {
    headers: { 'ngrok-skip-browser-warning': '1' },
  });
}

function fmt(str) {
  if (!str) return '—';
  return new Date(str).toLocaleString('en-MY', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function OdooSyncBadge({ odoo_sync }) {
  if (!odoo_sync) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
        No Odoo ref
      </span>
    );
  }
  if (odoo_sync.status === 'processed') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        <CheckCircle size={10} /> Synced
      </span>
    );
  }
  if (odoo_sync.status === 'dead') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700" title={odoo_sync.last_error || ''}>
        <AlertTriangle size={10} /> Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
      <Clock size={10} /> Pending ({odoo_sync.attempts ?? 0} attempts)
    </span>
  );
}

export default function CompletedDeliveries() {
  const [records,   setRecords]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [dateFrom,  setDateFrom]  = useState('');
  const [dateTo,    setDateTo]    = useState('');
  const [syncFilter, setSyncFilter] = useState('');
  const [expanded,  setExpanded]  = useState(null); // expanded row id for POD

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (dateFrom)   params.set('date_from',   dateFrom);
      if (dateTo)     params.set('date_to',      dateTo);
      if (syncFilter) params.set('sync_status',  syncFilter);

      const res  = await apiFetch(`orders/completed-deliveries?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setRecords(data.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, syncFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Completed Deliveries</h2>
          {/* <p className="text-sm text-gray-500">FR-04-004 — delivery completion records with POD and sync status</p> */}
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">Odoo Sync</label>
          <select
            value={syncFilter}
            onChange={e => setSyncFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            <option value="synced">Synced</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        <div className="flex items-end">
          <button
            onClick={load}
            className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
          >
            Apply
          </button>
        </div>
      </div>

      {/* State */}
      {loading && (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading…
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
      )}

      {/* Table (desktop) / Cards (mobile) */}
      {!loading && !error && (
        <>
          <p className="text-sm text-gray-500">{records.length} record{records.length !== 1 ? 's' : ''}</p>
          <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">Order ID</th>
                  <th className="px-4 py-3 text-left">Customer</th>
                  <th className="px-4 py-3 text-left">Driver</th>
                  <th className="px-4 py-3 text-left">Completed At</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">POD</th>
                  <th className="px-4 py-3 text-left">Odoo Sync</th>
                  <th className="px-4 py-3 text-left">Odoo Ref</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {records.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-400">No records found.</td>
                  </tr>
                )}
                {records.map(r => (
                  <>
                    <tr
                      key={r.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-blue-700">{r.id.slice(0, 8).toUpperCase()}</td>
                      <td className="px-4 py-3 text-gray-800">{r.customer_name || '—'}</td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1 text-gray-600">
                          <User className="w-3 h-3" /> {r.driver_name || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{fmt(r.completed_at)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          r.order_status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                        }`}>{r.order_status}</span>
                      </td>
                      <td className="px-4 py-3">
                        <PodThumbnails evidence={r.delivery_evidence} signatureUrl={r.proof_of_delivery_url} />
                      </td>
                      <td className="px-4 py-3"><OdooSyncBadge odoo_sync={r.odoo_sync} /></td>
                      <td className="px-4 py-3 text-xs text-gray-500">{r.odoo_order_ref || '—'}</td>
                    </tr>
                    {expanded === r.id && (
                      <tr key={`${r.id}-exp`}>
                        <td colSpan={8} className="px-6 py-4 bg-gray-50">
                          <ExpandedRow record={r} />
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="md:hidden space-y-3">
            {records.length === 0 && (
              <p className="text-center text-gray-400 py-8">No records found.</p>
            )}
            {records.map(r => (
              <div
                key={r.id}
                className="bg-white rounded-xl border border-gray-200 p-4 space-y-3 cursor-pointer"
                onClick={() => setExpanded(expanded === r.id ? null : r.id)}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-mono text-blue-700">#{r.id.slice(0, 8).toUpperCase()}</p>
                    <p className="font-semibold text-gray-800">{r.customer_name || '—'}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    r.order_status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                  }`}>{r.order_status}</span>
                </div>
                <div className="text-sm text-gray-500 space-y-1">
                  <p><span className="font-medium">Driver:</span> {r.driver_name || '—'}</p>
                  <p><span className="font-medium">Completed:</span> {fmt(r.completed_at)}</p>
                </div>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <PodThumbnails evidence={r.delivery_evidence} signatureUrl={r.proof_of_delivery_url} />
                  <OdooSyncBadge odoo_sync={r.odoo_sync} />
                </div>
                {expanded === r.id && <ExpandedRow record={r} />}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function mediaUrl(path) {
  if (!path) return '';
  if (path.startsWith('data:') || path.startsWith('http')) return path;
  return `${API_BASE.replace(/\/$/, '')}${path}`;
}

function PodThumbnails({ evidence = [], signatureUrl }) {
  const all = [
    ...evidence.map(url => ({ url, type: 'photo' })),
    ...(signatureUrl ? [{ url: signatureUrl, type: 'signature' }] : []),
  ];

  if (all.length === 0) {
    return <span className="text-xs text-gray-400">—</span>;
  }

  return (
    <div className="flex items-center gap-1">
      {all.slice(0, 3).map(({ url, type }, i) => (
        <a
          key={i}
          href={mediaUrl(url)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          title={type === 'signature' ? 'Customer signature' : `Photo ${i + 1}`}
          className="w-9 h-9 rounded-md border border-gray-200 bg-gray-100 flex items-center justify-center overflow-hidden hover:border-blue-400"
        >
          {url.startsWith('data:image') || url.match(/\.(jpe?g|png|gif|webp|avif)$/i) ? (
            <img src={mediaUrl(url)} alt={type} className="w-full h-full object-cover" />
          ) : (
            <ImageIcon className="w-4 h-4 text-gray-400" />
          )}
        </a>
      ))}
      {all.length > 3 && (
        <span className="text-xs text-gray-500">+{all.length - 3}</span>
      )}
    </div>
  );
}

function ExpandedRow({ record }) {
  const allEvidence = record.delivery_evidence || [];
  const hasSignature = !!record.proof_of_delivery_url;

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Proof of Delivery</p>
      {allEvidence.length === 0 && !hasSignature ? (
        <p className="text-sm text-gray-400">No POD captured.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {allEvidence.map((url, i) => (
            <a key={i} href={mediaUrl(url)} target="_blank" rel="noopener noreferrer">
              <img src={mediaUrl(url)} alt={`pod-${i}`} className="h-24 w-24 object-cover rounded-lg border hover:border-blue-400" />
            </a>
          ))}
          {hasSignature && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Signature</p>
              <img
                src={mediaUrl(record.proof_of_delivery_url)}
                alt="signature"
                className="h-20 border rounded-lg bg-white p-1"
              />
            </div>
          )}
        </div>
      )}

      {record.odoo_sync?.last_error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">
          <span className="font-semibold">Sync error:</span> {record.odoo_sync.last_error}
        </div>
      )}

      <div className="text-xs text-gray-500 space-y-1">
        <p><span className="font-medium">Delivery address:</span> {record.delivery_address || '—'}</p>
        {record.odoo_order_ref && (
          <p><span className="font-medium">Odoo ref:</span> {record.odoo_order_ref}</p>
        )}
      </div>
    </div>
  );
}
