import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Download, FileText, Trophy } from 'lucide-react';
import Modal from '../../common/Modal';
import RulesPanel from '../../performance/RulesPanel';
import OrderPointsList, { formatPoints } from '../../performance/OrderPointsList';
import { getAllTeams } from '../../../services/informationService';
import {
  addOrderPoints, getEmployeePerformance, getPerformanceRanking, reverseOrderPoints,
} from '../../../services/performanceApi';
import { exportCsv, exportPdf } from '../../../utils/performanceExport';

// FR-10-002/003/005: ranked points, filters by team/role/month, CSV + PDF export.
// FR-10-001: rules panel. Per-order extra points and per-item points are in the
// expanded employee row.

const pad = n => String(n).padStart(2, '0');
const isoDate = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const monthRange = (year, month) => ({ from: isoDate(new Date(year, month, 1)), to: isoDate(new Date(year, month + 1, 0)) });
const monthValue = from => (from ? from.slice(0, 7) : '');

const ROLE_OPTIONS = [
  { value: '', label: 'All roles' },
  { value: 'driver', label: 'Driver' },
  { value: 'assistant', label: 'Assistant' },
  { value: 'installer', label: 'Installer' },
];

function Select({ label, value, onChange, children }) {
  return (
    <label className="text-xs font-medium text-gray-600">
      {label}
      <select value={value} onChange={event => onChange(event.target.value)}
        className="mt-1 block rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900">
        {children}
      </select>
    </label>
  );
}

function AddPointsModal({ order, onClose, onSubmit }) {
  const [points, setPoints] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async event => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try { await onSubmit(order, points, reason); } catch (e) { setError(e.message); setBusy(false); }
  };
  return (
    <Modal show={!!order} onClose={onClose} maxWidth="max-w-md">
      <form onSubmit={submit} className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Extra points for {order?.do_ref || 'this order'}</h3>
        <p className="text-xs text-gray-500">Applies to the whole order: every crew member on it receives these points. Use a negative number to deduct.</p>
        <label className="block text-sm font-medium text-gray-700">Points
          <input type="number" step="0.01" required autoFocus value={points} onChange={e => setPoints(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
        </label>
        <label className="block text-sm font-medium text-gray-700">Reason
          <textarea required maxLength={500} rows={3} value={reason} onChange={e => setReason(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
        </label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm text-gray-600">Cancel</button>
          <button type="submit" disabled={busy} className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {busy ? 'Saving...' : 'Add points'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function EmployeePerformance() {
  const today = new Date();
  const [range, setRange] = useState(() => monthRange(today.getFullYear(), today.getMonth()));
  const [team, setTeam] = useState('');
  const [role, setRole] = useState('');
  const [search, setSearch] = useState('');
  const [teams, setTeams] = useState([]);
  const [ranking, setRanking] = useState({ rows: [], rm_per_point: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showRules, setShowRules] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState(null);
  const [addFor, setAddFor] = useState(null);

  useEffect(() => { getAllTeams().then(setTeams).catch(() => setTeams([])); }, []);

  const loadRanking = useCallback(() => {
    setLoading(true);
    setError(null);
    return getPerformanceRanking({ ...range, team, role })
      .then(setRanking)
      .catch(e => { setError(e.status === 401 || e.status === 403 ? 'Sign in again with an admin account to see performance.' : e.message); setRanking({ rows: [], rm_per_point: 0 }); })
      .finally(() => setLoading(false));
  }, [range, team, role]);
  useEffect(() => { loadRanking(); }, [loadRanking]);

  const loadDetail = useCallback(employeeId => {
    setDetail(null);
    setDetailError(null);
    return getEmployeePerformance(employeeId, range).then(setDetail).catch(e => setDetailError(e.message));
  }, [range]);
  useEffect(() => { if (expanded) loadDetail(expanded); }, [expanded, loadDetail]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? ranking.rows.filter(r => [r.name, r.job_role, ...(r.teams || [])].some(v => String(v || '').toLowerCase().includes(term))) : ranking.rows;
  }, [ranking, search]);
  const totals = useMemo(() => rows.reduce((t, r) => ({ orders: t.orders + r.completed_orders, points: t.points + r.total_points, rm: t.rm + r.incentive_rm }), { orders: 0, points: 0, rm: 0 }), [rows]);

  const refresh = async () => { await loadRanking(); if (expanded) await loadDetail(expanded); };
  const submitPoints = async (order, points, reason) => { await addOrderPoints(order.order_id, points, reason); setAddFor(null); await refresh(); };
  const reverse = async adjustment => {
    if (!window.confirm('Reverse these extra points? A reversing entry is added; the original stays in the history.')) return;
    try { await reverseOrderPoints(adjustment.id); await refresh(); } catch (e) { setDetailError(e.message); }
  };

  const label = `${range.from || 'start'} to ${range.to || 'today'}`;
  const filenameBase = `employee-performance-${range.from || 'all'}_${range.to || 'all'}`;
  const setMonth = value => { if (value) { const [y, m] = value.split('-').map(Number); setRange(monthRange(y, m - 1)); } };
  const teamName = teams.find(t => t.id === team)?.team_type;
  const subtitle = `Period ${label}${teamName ? ` · Team ${teamName}` : ''}${role ? ` · Role ${role}` : ''} · RM ${ranking.rm_per_point} per point`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-gray-600">Month
          <input type="month" value={monthValue(range.from)} onChange={e => setMonth(e.target.value)}
            className="mt-1 block rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900" />
        </label>
        <label className="text-xs font-medium text-gray-600">From
          <input type="date" value={range.from || ''} max={range.to || undefined} onChange={e => setRange(r => ({ ...r, from: e.target.value }))}
            className="mt-1 block rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900" />
        </label>
        <label className="text-xs font-medium text-gray-600">To
          <input type="date" value={range.to || ''} min={range.from || undefined} onChange={e => setRange(r => ({ ...r, to: e.target.value }))}
            className="mt-1 block rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900" />
        </label>
        <button type="button" onClick={() => setRange({ from: '', to: '' })} className="rounded-full border border-gray-200 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50">All time</button>
        <Select label="Team" value={team} onChange={setTeam}>
          <option value="">All teams</option>
          {teams.map(t => <option key={t.id} value={t.id}>{t.team_type || t.id}</option>)}
        </Select>
        <Select label="Role" value={role} onChange={setRole}>
          {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <label className="text-xs font-medium text-gray-600">Search
          <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Employee or team"
            className="mt-1 block rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900" />
        </label>
        <div className="ml-auto flex gap-2">
          <button type="button" disabled={!rows.length} onClick={() => exportCsv(rows, `${filenameBase}.csv`)}
            className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            <Download className="h-4 w-4" /> CSV
          </button>
          <button type="button" disabled={!rows.length}
            onClick={() => exportPdf(rows, { title: 'Employee Performance and Incentives', subtitle, filename: `${filenameBase}.pdf` })}
            className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            <FileText className="h-4 w-4" /> PDF
          </button>
        </div>
      </div>

      <div>
        <button type="button" onClick={() => setShowRules(v => !v)} aria-expanded={showRules}
          className="text-sm font-medium text-emerald-700 hover:underline">{showRules ? 'Hide' : 'Edit'} incentive rules</button>
        {showRules && <div className="mt-3"><RulesPanel onSaved={refresh} /></div>}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[['Employees', rows.length], ['Orders completed', totals.orders], [`Incentive (RM @ ${ranking.rm_per_point}/pt)`, totals.rm.toFixed(2)]].map(([name, value]) => (
          <div key={name} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="text-xs text-gray-500">{name}</div>
            <div className="text-xl font-bold text-gray-900">{value}</div>
          </div>
        ))}
      </div>

      {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="w-10 px-3 py-3" />
              <th className="px-3 py-3 text-left">Rank</th>
              <th className="px-3 py-3 text-left">Employee</th>
              <th className="px-3 py-3 text-left">Role</th>
              <th className="px-3 py-3 text-left">Team</th>
              <th className="px-3 py-3 text-right">Orders</th>
              <th className="px-3 py-3 text-right">Item pts</th>
              <th className="px-3 py-3 text-right">Bonus</th>
              <th className="px-3 py-3 text-right">Extra</th>
              <th className="px-3 py-3 text-right">Total pts</th>
              <th className="px-3 py-3 text-right">RM</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && <tr><td colSpan={11} className="px-3 py-6 text-center text-gray-500">Loading...</td></tr>}
            {!loading && !rows.length && !error && <tr><td colSpan={11} className="px-3 py-6 text-center text-gray-500">No completed orders with points for these filters.</td></tr>}
            {!loading && rows.map(row => {
              const open = expanded === row.employee_id;
              return (
                <React.Fragment key={row.employee_id}>
                  <tr className="hover:bg-gray-50">
                    <td className="px-3 py-3">
                      <button type="button" onClick={() => setExpanded(open ? null : row.employee_id)} aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} orders for ${row.name}`}
                        className="text-gray-500 hover:text-gray-800">
                        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </td>
                    <td className="px-3 py-3 font-semibold">{row.rank <= 3 ? <Trophy className="inline h-4 w-4 text-yellow-500" aria-hidden="true" /> : null} {row.rank}</td>
                    <td className="px-3 py-3 font-medium text-gray-900">{row.name}</td>
                    <td className="px-3 py-3 capitalize text-gray-600">{(row.award_roles || []).join(' / ')}</td>
                    <td className="px-3 py-3 text-gray-600">{(row.teams || []).join(', ') || '-'}</td>
                    <td className="px-3 py-3 text-right">{row.completed_orders}</td>
                    <td className="px-3 py-3 text-right">{formatPoints(row.item_points)}</td>
                    <td className="px-3 py-3 text-right">{formatPoints(row.bonus_points)}</td>
                    <td className="px-3 py-3 text-right">{formatPoints(row.manual_points)}</td>
                    <td className="px-3 py-3 text-right font-semibold text-emerald-700">{formatPoints(row.total_points)}</td>
                    <td className="px-3 py-3 text-right">{Number(row.incentive_rm).toFixed(2)}</td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={11} className="bg-white px-4 py-4">
                        {detailError && <p role="alert" className="mb-2 text-sm text-red-600">{detailError}</p>}
                        {!detail && !detailError && <p className="text-sm text-gray-500">Loading orders...</p>}
                        {detail && <OrderPointsList orders={detail.orders} onAddPoints={setAddFor} onReverse={reverse} />}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500">Every crew member on an order receives the full order points. Extra points added to an order go to everyone on it. RM uses the current RM-per-point rate.</p>

      {addFor && <AddPointsModal order={addFor} onClose={() => setAddFor(null)} onSubmit={submitPoints} />}
    </div>
  );
}
