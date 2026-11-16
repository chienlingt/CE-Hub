import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Download, Search } from 'lucide-react';
import RateEditor from '../../performance/RateEditor';
import OrderPointsList, { formatPoints } from '../../performance/OrderPointsList';
import { getAllTeams } from '../../../services/informationService';
import { getEmployeePerformance, getPerformanceRanking, setOrderExtra } from '../../../services/performanceApi';
import { exportCsv, exportPdf } from '../../../utils/performanceExport';

// Ranked points per employee (FR-10-002/003), with CSV and PDF export (FR-10-005).
// Click a person to see their completed orders; an admin edits each order's extra
// points right there. Points per item are set in Information > Item.

const pad = n => String(n).padStart(2, '0');
const isoDate = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

// The last 12 months, newest first, plus "All time".
function periodOptions() {
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return { value: `${date.getFullYear()}-${pad(date.getMonth() + 1)}`, label: date.toLocaleDateString('en-MY', { month: 'long', year: 'numeric' }) };
  });
  return [...months, { value: 'all', label: 'All time' }];
}
function rangeOf(period) {
  if (period === 'all') return { from: '', to: '' };
  const [year, month] = period.split('-').map(Number);
  return { from: isoDate(new Date(year, month - 1, 1)), to: isoDate(new Date(year, month, 0)) };
}

const ROLE_LABEL = { driver: 'Driver', assistant: 'Assistant', installer: 'Installer' };
const MEDAL = { 1: 'bg-yellow-100 text-yellow-800', 2: 'bg-gray-200 text-gray-700', 3: 'bg-orange-100 text-orange-800' };
const CONTROL = 'h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200';

function ExportMenu({ disabled, onCsv, onPdf }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = event => { if (event.type === 'keydown' ? event.key === 'Escape' : !ref.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" disabled={disabled} onClick={() => setOpen(v => !v)} aria-haspopup="menu" aria-expanded={open}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
        <Download className="h-4 w-4" /> Export <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-32 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {[['CSV', onCsv], ['PDF', onPdf]].map(([label, run]) => (
            <button key={label} type="button" role="menuitem" onClick={() => { setOpen(false); run(); }}
              className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">{label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function Card({ label, children, footer }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-gray-900">{children}</div>
      {footer && <div className="mt-1 min-h-[1.5rem]">{footer}</div>}
    </div>
  );
}

export default function EmployeePerformance() {
  const periods = useMemo(periodOptions, []);
  const [period, setPeriod] = useState(periods[0].value);
  const [team, setTeam] = useState('');
  const [role, setRole] = useState('');
  const [search, setSearch] = useState('');
  const [teams, setTeams] = useState([]);
  const [ranking, setRanking] = useState({ rows: [], rm_per_point: 0, estimated_orders: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState(null);

  const range = useMemo(() => rangeOf(period), [period]);

  useEffect(() => { getAllTeams().then(setTeams).catch(() => setTeams([])); }, []);

  const loadRanking = useCallback(() => {
    setLoading(true);
    setError(null);
    return getPerformanceRanking({ ...range, team, role })
      .then(setRanking)
      .catch(e => { setError(e.status === 401 || e.status === 403 ? 'Sign in again with an admin account to see performance.' : e.message); setRanking({ rows: [], rm_per_point: 0, estimated_orders: 0 }); })
      .finally(() => setLoading(false));
  }, [range, team, role]);
  useEffect(() => { loadRanking(); }, [loadRanking]);

  const loadDetail = useCallback(employeeId => {
    setDetailError(null);
    return getEmployeePerformance(employeeId, range).then(setDetail).catch(e => setDetailError(e.message));
  }, [range]);
  useEffect(() => { setDetail(null); if (expanded) loadDetail(expanded); }, [expanded, loadDetail]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? ranking.rows.filter(r => [r.name, ...(r.teams || []), ...(r.award_roles || [])].some(v => String(v || '').toLowerCase().includes(term))) : ranking.rows;
  }, [ranking, search]);
  const totals = useMemo(() => rows.reduce((t, r) => ({ orders: t.orders + r.completed_orders, rm: t.rm + r.incentive_rm }), { orders: 0, rm: 0 }), [rows]);

  // Setting extra points saves an order's points if they were only estimated, so reload both views.
  const setExtra = async (order, points) => {
    await setOrderExtra(order.order_id, points);
    await Promise.all([loadRanking(), expanded ? loadDetail(expanded) : null]);
  };

  const periodLabel = periods.find(p => p.value === period)?.label || period;
  const filename = `employee-performance-${period}`;
  const teamName = teams.find(t => t.id === team)?.team_type;
  const subtitle = `${periodLabel}${teamName ? ` · ${teamName}` : ''}${role ? ` · ${ROLE_LABEL[role]}` : ''} · RM ${ranking.rm_per_point} per point`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <select aria-label="Period" value={period} onChange={e => setPeriod(e.target.value)} className={CONTROL}>
          {periods.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <select aria-label="Team" value={team} onChange={e => setTeam(e.target.value)} className={CONTROL}>
          <option value="">All teams</option>
          {teams.map(t => <option key={t.id} value={t.id}>{t.team_type || t.id}</option>)}
        </select>
        <select aria-label="Role" value={role} onChange={e => setRole(e.target.value)} className={CONTROL}>
          <option value="">All roles</option>
          {Object.entries(ROLE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input type="search" aria-label="Search employees" placeholder="Search" value={search} onChange={e => setSearch(e.target.value)} className={`${CONTROL} w-full pl-9`} />
        </div>
        <ExportMenu disabled={!rows.length} onCsv={() => exportCsv(rows, `${filename}.csv`)}
          onPdf={() => exportPdf(rows, { title: 'Employee Performance and Incentives', subtitle, filename: `${filename}.pdf` })} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card label="Employees">{rows.length}</Card>
        <Card label="Orders completed">{totals.orders}</Card>
        <Card label="Incentive" footer={<RateEditor rate={ranking.rm_per_point} onSaved={loadRanking} />}>RM {totals.rm.toFixed(2)}</Card>
      </div>

      {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="w-16 py-3 pl-4 pr-2 text-left">Rank</th>
              <th className="px-3 py-3 text-left">Employee</th>
              <th className="px-3 py-3 text-right">Orders</th>
              <th className="px-3 py-3 text-right">Item pts</th>
              <th className="px-3 py-3 text-right">Extra</th>
              <th className="px-3 py-3 text-right" title="Every crew member on an order gets its full points">Total</th>
              <th className="py-3 pl-3 pr-4 text-right">RM</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">Loading…</td></tr>}
            {!loading && !rows.length && !error && <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500">No completed deliveries for this period.</td></tr>}
            {!loading && rows.map(row => {
              const open = expanded === row.employee_id;
              const subtitleParts = [(row.award_roles || []).map(r => ROLE_LABEL[r] || r).join(' / '), (row.teams || []).join(', ')].filter(Boolean);
              return (
                <React.Fragment key={row.employee_id}>
                  <tr onClick={() => setExpanded(open ? null : row.employee_id)} className={`cursor-pointer transition-colors hover:bg-gray-50 ${open ? 'bg-gray-50' : ''}`}>
                    <td className="py-3 pl-4 pr-2">
                      <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${MEDAL[row.rank] || 'text-gray-500'}`}>{row.rank}</span>
                    </td>
                    <td className="px-3 py-3">
                      <button type="button" aria-expanded={open} className="flex items-center gap-2 text-left focus-visible:outline-emerald-600">
                        {open ? <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />}
                        <span>
                          <span className="block font-medium text-gray-900">{row.name}</span>
                          {subtitleParts.length > 0 && <span className="block text-xs text-gray-500">{subtitleParts.join(' · ')}</span>}
                        </span>
                      </button>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-gray-700">{row.completed_orders}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-gray-700">{formatPoints(row.item_points)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-gray-700">{formatPoints(row.manual_points)}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-emerald-700">{formatPoints(row.total_points)}</td>
                    <td className="py-3 pl-3 pr-4 text-right tabular-nums text-gray-700">{Number(row.incentive_rm).toFixed(2)}</td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={7} className="bg-gray-50 px-4 pb-4 pt-1">
                        {detailError && <p role="alert" className="mb-2 text-sm text-red-600">{detailError}</p>}
                        {!detail && !detailError && <p className="py-2 text-sm text-gray-400">Loading…</p>}
                        {detail && <OrderPointsList orders={detail.orders} onSetExtra={setExtra} />}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {ranking.estimated_orders > 0 && (
        <p className="text-xs text-gray-500">{ranking.estimated_orders} order{ranking.estimated_orders === 1 ? '' : 's'} marked Estimated: points not saved yet, using the current item points.</p>
      )}
    </div>
  );
}
