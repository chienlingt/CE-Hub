import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { API_BASE_URL } from '../../utils/apiBaseUrl';

const LABELS = { queued: 'Queued', running: 'Running', retry_wait: 'Retry scheduled', retry_exhausted: 'Retries exhausted', needs_correction: 'Needs correction', completed: 'Completed', pending_approval: 'Pending approval at receipt', sender_retry_required: 'Odoo resend needed' };
const time = value => value ? new Date(value).toLocaleString('en-MY') : '—';
const color = status => status === 'completed' ? 'bg-emerald-50 text-emerald-700' : ['needs_correction', 'retry_exhausted', 'sender_retry_required'].includes(status) ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800';
export default function SyncRunHistory({ token, refreshVersion = 0 }) {
  const [rows, setRows] = useState([]), [total, setTotal] = useState(0);
  const [source, setSource] = useState(''), [status, setStatus] = useState(''), [offset, setOffset] = useState(0);
  const [error, setError] = useState(''), [loading, setLoading] = useState(false), [open, setOpen] = useState(null);
  const generation = useRef(0);
  const invalidate = useCallback(() => { generation.current++; }, []);
  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    try {
      const query = new URLSearchParams({ offset: String(offset), ...(source ? { source } : {}), ...(status ? { status } : {}) });
      const response = await fetch(`${API_BASE_URL}/api/odoo-change-requests/sync-runs?${query}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load sync history.');
      if (current !== generation.current) return;
      setRows(data.rows || []); setTotal(data.total || 0); setError('');
    } catch (err) { if (current === generation.current) setError(err.message); }
    finally { if (current === generation.current) setLoading(false); }
  }, [token, offset, source, status]);
  useEffect(() => { load(); const timer = setInterval(load, 30000); return () => { clearInterval(timer); invalidate(); }; }, [load, refreshVersion, invalidate]);
  return <section aria-label="Integration sync runs" className="border-t border-gray-200">
    <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-50 px-4 py-3">
      <div><h2 className="text-sm font-semibold text-gray-900">Sync runs</h2><p className="mt-0.5 text-xs text-gray-500">Incoming Odoo requests and 5 PM recovery · retries keep the original delivery date</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Sync source" value={source} onChange={e => { setSource(e.target.value); setOffset(0); }} className="rounded-lg border bg-white p-2 text-xs"><option value="">All sources</option><option value="fallback_5pm">5 PM fallback · Odoo API</option><option value="odoo_webhook">Odoo webhook</option></select>
        <select aria-label="Run result" value={status} onChange={e => { setStatus(e.target.value); setOffset(0); }} className="rounded-lg border bg-white p-2 text-xs"><option value="">All results</option>{Object.entries(LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        <button type="button" onClick={load} aria-label="Refresh sync runs" className="rounded-lg border bg-white p-2"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
      </div>
    </div>
    {error && <p role="alert" className="px-4 py-3 text-sm text-red-700">{error}</p>}
    {!rows.length && !error && <p className="px-4 py-5 text-sm text-gray-500">{loading ? 'Loading runs…' : 'No recorded runs yet. History starts after this update.'}</p>}
    <div className="divide-y divide-gray-100">{rows.map(row => {
      const report = row.report || {}, counts = report.counts || {}, expanded = open === row.id;
      return <div key={row.id}>
        <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : row.id)} className="flex w-full items-start gap-2 px-4 py-3 text-left hover:bg-gray-50">
          {expanded ? <ChevronDown size={16} className="mt-0.5 shrink-0" /> : <ChevronRight size={16} className="mt-0.5 shrink-0" />}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-semibold text-gray-900">{row.source === 'fallback_5pm' ? '5 PM fallback · Odoo API' : 'Odoo webhook'}</span><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${color(row.status)}`}>{LABELS[row.status] || row.status}</span></div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500"><span>Recorded {time(row.created_at)}</span><span>Delivery date {row.target_date || 'Not supplied'}</span><span>{counts.synced || 0} synced · {counts.skipped || 0} skipped · {counts.failed || 0} failed{counts.pending ? ` · ${counts.pending} awaiting approval` : ''}</span></div>
            {row.next_retry_at && <p className="mt-1 text-xs text-amber-700">Next retry {time(row.next_retry_at)} · attempt {row.attempts}/4</p>}
          </div>
        </button>
        {expanded && <div className="space-y-3 bg-gray-50 px-4 pb-4 pt-1 sm:pl-10">
          <p className="text-xs text-gray-500">{report.endpoint || report.mechanism} · {counts.candidates || 0} checked · {row.attempts} attempt(s) · updated {time(row.updated_at)}</p>
          {report.error && <p role="status" className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">{report.error}</p>}
          <div className="overflow-x-auto rounded-lg border bg-white"><table className="w-full text-left text-xs"><thead className="bg-gray-100 text-gray-500"><tr><th className="p-2">DO</th><th className="p-2">Result</th><th className="p-2">Reason</th></tr></thead><tbody className="divide-y">{(report.outcomes || []).map((item, i) => <tr key={`${item.picking_id || item.do_ref}-${i}`}><td className="whitespace-nowrap p-2 font-mono">{item.do_ref || `Picking ${item.picking_id || '—'}`}</td><td className="p-2">{item.outcome?.replaceAll('_', ' ')}</td><td className="min-w-[180px] p-2 text-gray-600">{item.message || item.reason?.replaceAll('_', ' ') || '—'}{item.code && <span className="ml-1 font-mono text-gray-400">({item.code})</span>}{item.outcome === 'failed' && <span className="mt-1 block text-[11px]">{item.retryable ? row.status === 'retry_wait' ? 'Automatic retry scheduled' : 'Temporary failure; retry budget exhausted or run stopped' : 'Waiting for correction; no automatic retry'}</span>}</td></tr>)}</tbody></table></div>
          {report.history?.length > 0 && <div className="space-y-1 text-xs text-gray-500">{report.history.map(h => <p key={h.attempt}>Attempt {h.attempt} · {time(h.at)} · {LABELS[h.status] || h.status}{h.result ? ` · ${h.result.synced || 0} synced / ${h.result.skipped || 0} skipped / ${h.result.failed || 0} failed` : ''}</p>)}</div>}
          <p className="text-xs text-gray-500">{report.retry_note || 'Temporary errors: up to 3 retries (5, 15, 30 min). Invalid data/configuration waits for correction. A retry never rolls the target date forward.'}</p>
        </div>}
      </div>;
    })}</div>
    {total > 25 && <div className="flex items-center justify-between border-t px-4 py-2 text-xs"><button type="button" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 25))} className="p-2 disabled:opacity-30">Previous</button><span>{offset + 1}–{Math.min(offset + 25, total)} of {total}</span><button type="button" disabled={offset + 25 >= total} onClick={() => setOffset(offset + 25)} className="p-2 disabled:opacity-30">Next</button></div>}
  </section>;
}
