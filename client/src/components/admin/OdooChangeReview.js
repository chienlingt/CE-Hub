import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ShieldCheck, X, ChevronRight, Loader2 } from 'lucide-react';
import { API_BASE_URL } from '../../utils/apiBaseUrl';

const KIND_LABELS = {
  preparation: 'Preparation change',
  appointment_edit: 'Appointment edit request',
  appointment_cancel: 'Appointment cancellation request',
};
const kindLabel = kind => KIND_LABELS[kind] || 'Order change';
const display = value => {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Ready' : 'Not ready';
  if (Array.isArray(value)) return value.length ? value.map(v => typeof v === 'object' ? JSON.stringify(v) : v).join(', ') : 'None';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
};
function ReviewDialog({ request, busy, error, onClose, onDecision }) {
  const [note, setNote] = useState('');
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    if (element.showModal) element.showModal(); else element.setAttribute('open', '');
    return () => { if (element.close) element.close(); };
  }, []);
  return createPortal(
    <dialog ref={dialog} aria-labelledby="odoo-review-title" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }} className="m-auto w-[calc(100%-1.5rem)] max-w-3xl max-h-[90dvh] rounded-2xl border border-gray-200 p-0 shadow-2xl backdrop:bg-black/40">
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b bg-white px-5 py-4">
        <div><h2 id="odoo-review-title" className="font-semibold text-gray-900">{request.do_ref}</h2><p className="text-xs text-gray-500">{kindLabel(request.request_kind)} · {request.current_order_status || 'Order removed'}</p></div>
        <button type="button" onClick={onClose} disabled={busy} aria-label="Close review" className="rounded-lg p-2 hover:bg-gray-100 disabled:opacity-40"><X size={20} /></button>
      </div>
      <div className="space-y-4 p-5">
        {request.request_kind?.startsWith('appointment_')
          ? <p className="text-xs leading-relaxed text-gray-500">Approval releases the time slot and returns the DO to Pending. Odoo clears its confirmed appointment so the salesperson can confirm a new one.{request.payload?.requested_by ? ` Requested by ${request.payload.requested_by}.` : ''}</p>
          : <p className="text-xs leading-relaxed text-gray-500">Approval keeps the delivery status, time slot and scan history. An address change may need a separate route review.</p>}
        {request.approval_blockers?.length > 0 && request.status === 'pending' && <div role="status" className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{request.approval_blockers.map((message, i) => <p key={i}>{message}</p>)}</div>}
        <div className="divide-y rounded-xl border border-gray-200">
          {(request.changes || []).map(change => <div key={change.field} className="p-3">
            <p className="mb-2 text-xs font-semibold text-gray-600">{change.label}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="min-w-0 rounded-lg bg-gray-50 p-2.5"><span className="mb-1 block text-[10px] uppercase tracking-wide text-gray-400">Current at request</span><p className="break-words whitespace-pre-wrap text-sm text-gray-600">{display(change.before)}</p></div>
              <div className="min-w-0 rounded-lg bg-blue-50 p-2.5"><span className="mb-1 block text-[10px] uppercase tracking-wide text-blue-500">Requested</span><p className="break-words whitespace-pre-wrap text-sm text-blue-900">{display(change.after)}</p></div>
            </div>
          </div>)}
        </div>
        {request.status === 'pending' ? <label className="block text-xs font-medium text-gray-600">Note <span className="font-normal text-gray-400">(required when rejecting)</span><textarea value={note} onChange={e => setNote(e.target.value)} maxLength={2000} rows={2} disabled={busy} className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-sm" /></label>
          : <p className="text-sm text-gray-600">{request.status === 'approved' ? 'Approved' : 'Rejected'} by {request.reviewed_by_name || 'Admin'}{request.reviewed_at ? ` · ${new Date(request.reviewed_at).toLocaleString('en-MY')}` : ''}{request.review_note ? ` — ${request.review_note}` : ''}</p>}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </div>
      {request.status === 'pending' && <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-white px-5 py-3">
        <button type="button" onClick={() => onDecision('reject', note)} disabled={busy || note.trim().length < 3} className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40">Reject</button>
        <button type="button" onClick={() => onDecision('approve', note)} disabled={busy || !request.can_approve} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40">{busy && <Loader2 size={14} className="animate-spin" />}Approve</button>
      </div>}
    </dialog>, document.body
  );
}

export default function OdooChangeReview({ token, refreshVersion = 0, onChanged }) {
  const [rows, setRows] = useState([]), [total, setTotal] = useState(0);
  const [status, setStatus] = useState('pending'), [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState(null), [error, setError] = useState(''), [decisionError, setDecisionError] = useState('');
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(false);
  const sequence = useRef(0);
  const invalidate = useCallback(() => { sequence.current++; }, []);
  const api = useCallback(async (path, options = {}) => {
    const res = await fetch(`${API_BASE_URL}/api/odoo-change-requests${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Unable to load review requests.');
    return data;
  }, [token]);
  const load = useCallback(async () => {
    const current = ++sequence.current; setLoading(true);
    try {
      const data = await api(`?status=${status}&offset=${offset}`);
      if (current === sequence.current) { setRows(data.rows || []); setTotal(data.total || 0); setError(''); }
    } catch (err) { if (current === sequence.current) setError(err.message); }
    finally { if (current === sequence.current) setLoading(false); }
  }, [api, status, offset]);
  useEffect(() => { load(); const timer = setInterval(load, 30000); return () => { clearInterval(timer); invalidate(); }; }, [load, refreshVersion, invalidate]);
  const review = async id => {
    setError(''); setDecisionError('');
    try { setSelected(await api(`/${id}`)); } catch (err) { setError(err.message); }
  };
  const decide = async (decision, note) => {
    setBusy(true); setDecisionError('');
    try { await api(`/${selected.id}/decision`, { method: 'POST', body: JSON.stringify({ decision, note }) }); setSelected(null); await load(); onChanged?.(); }
    catch (err) { setDecisionError(err.message); try { setSelected(await api(`/${selected.id}`)); } catch {} }
    finally { setBusy(false); }
  };
  return <section aria-label="Odoo changes needing approval" className="overflow-hidden rounded-xl border border-gray-200 bg-white">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-gray-50 px-4 py-3">
      <div><h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900"><ShieldCheck size={17} />Needs approval</h2><p className="mt-1 text-xs text-gray-500">Compare changes before accepting. Scans and delivery outcomes stay protected.</p></div>
      <select aria-label="Approval status" value={status} onChange={e => { setStatus(e.target.value); setOffset(0); }} className="rounded-lg border bg-white p-2 text-xs"><option value="pending">Pending</option><option value="all">All decisions</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select>
    </div>
    {error && <p role="alert" className="p-4 text-sm text-red-700">{error}</p>}
    <div className="divide-y">{rows.map(request => <button key={request.id} type="button" onClick={() => review(request.id)} className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left hover:bg-gray-50">
      <div><p className="text-sm font-semibold text-gray-900">{request.do_ref}<span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-normal text-amber-800">{request.status}</span></p><p className="mt-1 text-xs text-gray-500">{kindLabel(request.request_kind)} · {request.changes?.length || 0} changes ·{new Date(request.created_at).toLocaleString('en-MY')}{request.reviewed_by_name ? ` · ${request.reviewed_by_name}` : ''}</p></div><ChevronRight size={17} />
    </button>)}</div>
    {!rows.length && !error && <p className="px-4 py-10 text-center text-sm text-gray-500">{loading ? 'Loading…' : 'No requests to review.'}</p>}
    {total > 50 && <div className="flex justify-between border-t px-4 py-2 text-xs"><button type="button" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 50))}>Previous</button><span>{offset + 1}–{Math.min(offset + 50, total)} of {total}</span><button type="button" disabled={offset + 50 >= total} onClick={() => setOffset(offset + 50)}>Next</button></div>}
    {selected && <ReviewDialog request={selected} busy={busy} error={decisionError} onClose={() => { if (!busy) setSelected(null); }} onDecision={decide} />}
  </section>;
}
