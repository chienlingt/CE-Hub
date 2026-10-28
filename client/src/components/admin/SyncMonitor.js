import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, ArrowDownLeft, ArrowUpRight, ChevronDown, ChevronRight, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { API_BASE_URL } from '../../utils/apiBaseUrl';
import OdooChangeReview from './OdooChangeReview';
import SyncRunHistory from './SyncRunHistory';

const time = value => value ? new Date(value).toLocaleString('en-MY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const sourceName = value => ({ odoo_webhook: 'Webhook', fallback_5pm: '5 PM fallback', unknown: 'Not recorded' }[value] || 'Not recorded');
const statuses = { imported: 'Imported', updated: 'Updated', failed: 'Failed', retrying: 'Retry scheduled', pending_approval: 'Needs approval', rejected: 'Rejected', not_recorded: 'Not recorded', skipped: 'Skipped', unchanged: 'Unchanged', accepted: 'Accepted', previously_reviewed: 'Previously reviewed' };
function Badge({ value, children }) {
  const tone = ['failed', 'dead', 'rejected'].includes(value) ? 'bg-red-50 text-red-700' : ['pending', 'pending_approval', 'retrying'].includes(value) ? 'bg-amber-50 text-amber-800' : ['processed', 'imported', 'updated'].includes(value) ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600';
  return <span className={'inline-flex whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium ' + tone}>{children || statuses[value] || value}</span>;
}
function Pager({ offset, total, setOffset }) {
  if (total <= 25) return null;
  return <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-gray-500"><button type="button" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 25))} className="rounded px-2 py-1 disabled:opacity-30">Previous</button><span>{offset + 1}–{Math.min(offset + 25, total)} of {total}</span><button type="button" disabled={offset + 25 >= total} onClick={() => setOffset(offset + 25)} className="rounded px-2 py-1 disabled:opacity-30">Next</button></div>;
}
export default function SyncMonitor() {
  const [token] = useState(() => { try { return JSON.parse(sessionStorage.getItem('adminSession'))?.token || ''; } catch { return ''; } });
  const [tab, setTab] = useState('incoming'), [refresh, setRefresh] = useState(0);
  const [source, setSource] = useState(''), [status, setStatus] = useState(''), [search, setSearch] = useState(''), [debouncedSearch, setDebouncedSearch] = useState('');
  const [offset, setOffset] = useState(0), [jobOffset, setJobOffset] = useState(0), [jobStatus, setJobStatus] = useState('');
  const [incoming, setIncoming] = useState({ rows: [], total: 0, summary: {} }), [outgoing, setOutgoing] = useState({ rows: [], total: 0, summary: {} });
  const [error, setError] = useState(''), [loading, setLoading] = useState(false), [open, setOpen] = useState(null), [jobOpen, setJobOpen] = useState(null);
  const seq = useRef(0);
  const history = useRef(null);
  const invalidate = useCallback(() => { seq.current++; }, []);
  useEffect(() => { const timer = setTimeout(() => { setDebouncedSearch(search); setOffset(0); }, 250); return () => clearTimeout(timer); }, [search]);
  const load = useCallback(async () => {
    if (!token) return;
    const current = ++seq.current; setLoading(true);
    try {
      const query = new URLSearchParams({ source, status, search: debouncedSearch, offset: String(offset) });
      const jobs = new URLSearchParams({ status: jobStatus, offset: String(jobOffset) });
      const responses = await Promise.all([fetch(API_BASE_URL + '/api/odoo-change-requests/monitor/orders?' + query, { headers: { Authorization: 'Bearer ' + token } }), fetch(API_BASE_URL + '/api/odoo-change-requests/monitor/outgoing?' + jobs, { headers: { Authorization: 'Bearer ' + token } })]);
      const data = await Promise.all(responses.map(res => res.json()));
      const failure = responses.findIndex(res => !res.ok);
      if (failure >= 0) throw new Error(data[failure].error || 'Unable to load sync monitor.');
      if (current !== seq.current) return;
      setIncoming(data[0]); setOutgoing(data[1]); setError('');
    } catch (err) { if (current === seq.current) setError(err.message); }
    finally { if (current === seq.current) setLoading(false); }
  }, [token, source, status, offset, jobStatus, jobOffset, debouncedSearch]);
  useEffect(() => { load(); const timer = setInterval(load, 30000); return () => { clearInterval(timer); invalidate(); }; }, [load, refresh, invalidate]);
  const refreshAll = () => setRefresh(value => value + 1);
  if (!token) return <div className="m-6 rounded-xl border bg-white p-6"><h1 className="text-xl font-semibold">Sync Monitor</h1><p className="mt-2 text-sm text-gray-600">Please sign out and sign in once to activate your admin login. No separate password verification is needed here.</p></div>;
  return <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="flex items-center justify-between gap-3"><div><h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><Activity size={22} className="text-blue-600" />Sync Monitor</h1><p className="mt-1 text-xs text-gray-500">Odoo → CE Hub → Odoo · automatic fallback at 5 PM MYT</p></div><button type="button" onClick={refreshAll} className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /><span className="hidden sm:inline">Refresh</span></button></header>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[{ label: 'Incoming issues', value: (incoming.summary.attention || 0) + (outgoing.summary.run_issues || 0), color: 'text-red-700', action: () => { setTab('incoming'); setStatus('attention'); setOffset(0); } },
          { label: 'Needs approval', value: outgoing.summary.approvals || 0, color: 'text-amber-700', action: () => setTab('approvals') },
          { label: 'Outgoing queued', value: outgoing.summary.pending || 0, color: 'text-blue-700', action: () => { setTab('outgoing'); setJobStatus('pending'); setJobOffset(0); } },
          { label: 'Outgoing failed', value: outgoing.summary.dead || 0, color: 'text-red-700', action: () => { setTab('outgoing'); setJobStatus('dead'); setJobOffset(0); } }].map(item => <button type="button" key={item.label} onClick={item.action} className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-left hover:border-gray-400"><p className="text-xs text-gray-500">{item.label}</p><p className={'mt-1 text-2xl font-semibold ' + item.color}>{item.value}</p></button>)}
      </div>
      <nav aria-label="Sync monitor sections" className="flex gap-1 overflow-x-auto rounded-xl border bg-white p-1">
        {[{ key: 'incoming', label: 'Incoming orders', short: 'Incoming', icon: ArrowDownLeft }, { key: 'approvals', label: 'Needs approval', short: 'Review', icon: ShieldCheck }, { key: 'outgoing', label: 'Outgoing jobs', short: 'Outgoing', icon: ArrowUpRight }].map(item => <button type="button" key={item.key} aria-label={item.label} aria-current={tab === item.key ? 'page' : undefined} onClick={() => setTab(item.key)} className={'flex min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2.5 text-xs font-semibold sm:flex-none sm:px-5 sm:text-sm ' + (tab === item.key ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50')}><item.icon size={16} className="hidden sm:block" /><span className="hidden sm:inline">{item.label}</span><span className="sm:hidden">{item.short}</span>{item.key === 'approvals' && outgoing.summary.approvals > 0 && <span className="rounded-full bg-amber-100 px-1.5 text-xs text-amber-900">{outgoing.summary.approvals}</span>}</button>)}
      </nav>
      {tab === 'incoming' && <>
        {outgoing.summary.run_issues > 0 && <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900"><p>{outgoing.summary.run_issues} run-level issue(s), such as discovery or configuration failure, have no DO to list below.</p><button type="button" onClick={() => { if (history.current) { history.current.open = true; history.current.scrollIntoView?.({ behavior: 'smooth', block: 'start' }); } }} className="font-semibold underline">View run history</button></div>}
        <section aria-label="Incoming orders" className="overflow-hidden rounded-xl border bg-white">
          <div className="flex flex-wrap items-center gap-2 border-b p-3 sm:p-4">
            <label className="relative min-w-[180px] flex-1"><Search size={16} className="absolute left-3 top-2.5 text-gray-400" /><input aria-label="Search incoming orders" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search DO or customer" className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm" /></label>
            <select aria-label="Incoming source" value={source} onChange={e => { setSource(e.target.value); setOffset(0); }} className="rounded-lg border bg-white p-2 text-sm"><option value="">All sources</option><option value="odoo_webhook">Webhook</option><option value="fallback_5pm">5 PM fallback</option><option value="unknown">Not recorded</option></select>
            <select aria-label="Incoming result" value={status} onChange={e => { setStatus(e.target.value); setOffset(0); }} className="rounded-lg border bg-white p-2 text-sm"><option value="">All results</option><option value="attention">Needs investigation</option>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
          </div>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500"><tr>{['DO / Customer', 'Source', 'CE Hub status', 'Incoming result', 'Last activity', ''].map((label, i) => <th key={i} className="whitespace-nowrap px-4 py-3 font-medium">{label}</th>)}</tr></thead>
            <tbody className="divide-y">{incoming.rows.map(row => <React.Fragment key={row.do_ref}>
              <tr className={['failed', 'retrying', 'rejected'].includes(row.sync_status) ? 'bg-red-50/40' : ''}>
                <td className="px-4 py-3"><p className="whitespace-nowrap font-mono text-xs font-semibold text-gray-900">{row.do_ref}{row.preview_only && <span className="ml-2 font-sans text-[10px] text-violet-600">DEMO</span>}</p><p className="mt-1 text-xs text-gray-500">{row.customer_name || 'Not imported into CE Hub'}</p></td>
                <td className="whitespace-nowrap px-4 py-3 text-xs">{sourceName(row.source)}</td>
                <td className="px-4 py-3"><Badge value={row.ce_hub_status || 'Not imported'} /></td>
                <td className="px-4 py-3"><div className="flex flex-wrap gap-1"><Badge value={row.sync_status} />{row.needs_approval && row.sync_status !== 'pending_approval' && <Badge value="pending_approval" />}</div></td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">{time(row.activity_at)}</td>
                <td className="px-3"><button type="button" aria-label={'Details for ' + row.do_ref} aria-expanded={open === row.do_ref} onClick={() => setOpen(open === row.do_ref ? null : row.do_ref)} className="rounded-lg p-2 hover:bg-gray-100">{open === row.do_ref ? <ChevronDown size={17} /> : <ChevronRight size={17} />}</button></td>
              </tr>
              {open === row.do_ref && <tr><td colSpan={6} className="bg-gray-50 px-4 py-4"><div className="space-y-2 text-xs text-gray-600">
                {row.preview_only && <p className="text-violet-700">Layout preview only. Demo retry states are static; no request is sent to Odoo.</p>}
                {row.reason && <p className="font-medium text-red-700">{row.reason}{row.code ? ' (' + row.code + ')' : ''}</p>}
                <p>{row.next_action || (row.sync_status === 'not_recorded' ? 'This older order has no recorded incoming event. Its source cannot be confirmed.' : 'Incoming result only; outgoing delivery updates are tracked separately.')}</p>
                {row.review_note && <p>Review note: {row.review_note}</p>}
                {row.next_retry_at && <p>Next retry: {time(row.next_retry_at)}</p>}
                <p>Latest event: {sourceName(row.latest_source)} · first successful import: {row.import_source ? sourceName(row.import_source) : row.order_id ? 'Not recorded' : 'Not imported'}</p>
                {(row.latest_source || row.source) === 'fallback_5pm' ? <div className="flex flex-wrap items-center gap-2"><span>Use the original fallback run after correcting the issue; /order is not a generic fallback retry.</span><button type="button" onClick={() => { if (history.current) { history.current.open = true; history.current.scrollIntoView?.({ behavior: 'smooth', block: 'start' }); } }} className="rounded-lg border bg-white px-3 py-2 font-semibold">Run history / Retry failed</button></div> : <div className="flex flex-wrap items-center gap-2"><span>Resend through Odoo/GCA:</span><code className="rounded border bg-white px-2 py-1">POST /api/webhooks{row.endpoint || '/odoo/order'}</code><span>{row.endpoint === '/odoo/order-cancel' ? 'Corrected cancellation request' : 'Full corrected snapshot'} · no automatic manual resend from this page</span></div>}
                {row.needs_approval && <button type="button" onClick={() => setTab('approvals')} className="rounded-lg bg-amber-100 px-3 py-2 font-semibold text-amber-900">Review pending changes</button>}
              </div></td></tr>}
            </React.Fragment>)}</tbody></table></div>
          {!incoming.rows.length && !error && <p className="p-10 text-center text-sm text-gray-500">{loading ? 'Loading…' : 'No incoming orders match these filters.'}</p>}
          <Pager offset={offset} total={incoming.total} setOffset={setOffset} />
        </section>
        <details ref={history} className="overflow-hidden rounded-xl border bg-white"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-700">Run history <span className="ml-2 text-xs font-normal text-gray-400">Polling attempts and webhook receipts</span></summary><SyncRunHistory token={token} refreshVersion={refresh} /></details>
      </>}
      {tab === 'approvals' && <OdooChangeReview token={token} refreshVersion={refresh} onChanged={refreshAll} />}
      {tab === 'outgoing' && <section aria-label="Outgoing jobs" className="overflow-hidden rounded-xl border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"><div><h2 className="text-sm font-semibold text-gray-900">CE Hub → Odoo</h2><p className="mt-1 text-xs text-gray-500">Queued, processed and failed status updates. Internal audit events are excluded.</p></div><select aria-label="Outgoing result" value={jobStatus} onChange={e => { setJobStatus(e.target.value); setJobOffset(0); }} className="rounded-lg border bg-white p-2 text-sm"><option value="">All jobs</option><option value="pending">Queued / retrying</option><option value="processed">Processed</option><option value="dead">Failed</option></select></div>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-gray-50 text-[11px] uppercase text-gray-500"><tr>{['DO', 'Update', 'Result', 'Attempts', 'Next retry', ''].map((label, i) => <th key={i} className="whitespace-nowrap px-4 py-3 font-medium">{label}</th>)}</tr></thead><tbody className="divide-y">{outgoing.rows.map(row => <React.Fragment key={row.id}><tr className={row.status === 'dead' ? 'bg-red-50/40' : ''}>
          <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold">{row.payload?.do_ref || row.payload?.odooRef || '—'}{row.payload?.preview_only && <span className="ml-2 font-sans text-[10px] text-violet-600">DEMO</span>}</td>
          <td className="px-4 py-3 text-xs">{row.payload?.status || row.event_type}</td><td className="px-4 py-3"><Badge value={row.status}>{row.status === 'processed' ? 'Processed' : row.status === 'dead' ? 'Failed' : row.attempts ? 'Retry scheduled' : 'Queued'}</Badge></td>
          <td className="px-4 py-3 text-xs">{row.attempts}</td><td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">{row.status === 'pending' ? time(row.next_retry_at) : '—'}</td>
          <td className="px-3"><button type="button" aria-label={'Job details for ' + (row.payload?.do_ref || row.id)} aria-expanded={jobOpen === row.id} onClick={() => setJobOpen(jobOpen === row.id ? null : row.id)} className="rounded-lg p-2 hover:bg-gray-100">{jobOpen === row.id ? <ChevronDown size={17} /> : <ChevronRight size={17} />}</button></td>
        </tr>{jobOpen === row.id && <tr><td colSpan={6} className="space-y-2 bg-gray-50 px-4 py-4 text-xs text-gray-600">{row.last_error && <p className="text-red-700">{row.last_error}</p>}<p>Created {time(row.created_at)} · processed {time(row.processed_at)} · {row.event_type}</p><p>{row.payload?.preview_only ? 'Layout preview only. This job is excluded from the worker and will never be sent to Odoo.' : row.status === 'dead' ? 'Investigate the failure and confirm the actual status in Odoo. No manual retry endpoint is available.' : 'Processed describes the worker outcome; it is not a universal proof that Odoo accepted every field.'}</p></td></tr>}</React.Fragment>)}</tbody></table></div>
        {!outgoing.rows.length && !error && <p className="p-10 text-center text-sm text-gray-500">No outgoing jobs match this filter.</p>}
        <Pager offset={jobOffset} total={outgoing.total} setOffset={setJobOffset} />
      </section>}
    </div>
  </div>;
}
