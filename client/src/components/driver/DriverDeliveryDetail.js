import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Camera, RefreshCw, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useDriverJobs } from '../../hooks/useDriverJobs';
import { API_BASE_URL } from '../../utils/apiBaseUrl';
import { isTerminal } from '../../utils/driverStatusMap';
import OrderTaskCard from './OrderTaskCard';
import UpdateOrderModal from './UpdateOrderModal';
import DeliveryEvidenceModal from './DeliveryEvidenceModal';
import ContactReportModal from './ContactReportModal';
import FailDeliveryModal from './FailDeliveryModal';
import ScannerModal from '../common/ScannerModal';
import { deliveryTime, navigateToDelivery } from './DriverDeliveryCard';
import useDeliveryStop from '../../hooks/useDeliveryStop';
import { enrichJobsWithAppointmentWindow } from '../../utils/driverOrderFilters';

const api = path => `${API_BASE_URL.replace(/\/$/, '')}/api/${path}`;
const itemColors = { pending: 'bg-gray-100 text-gray-600', loaded: 'bg-green-100 text-green-700', unloaded: 'bg-purple-100 text-purple-700' };

export default function DriverDeliveryDetail({ detailOrderId, initialOrder, initialStop, onClose }) {
  const { orderId: routeOrderId } = useParams();
  const orderId = detailOrderId || routeOrderId;
  const pageRef = useRef(null);
  useLayoutEffect(() => {
    const scroller = pageRef.current?.closest('[data-page-scroll]') || document.scrollingElement;
    if (scroller) scroller.scrollTop = 0;
  }, [orderId]);
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, employeeData } = useAuth();
  const role = employeeData?.role?.name || currentUser?.role?.name || currentUser?.role || '';
  const admin = String(role).toLowerCase().includes('admin');
  const employeeId = currentUser?.employeeId || '';
  const { jobs, loading, error, refresh } = useDriverJobs(admin ? null : employeeId);
  const [scanOrder, setScanOrder] = useState(initialOrder || location.state?.scanOrder || null);
  const [readLoading, setReadLoading] = useState(admin);
  const [readError, setReadError] = useState('');
  const fetchAdminOrder = useCallback(async signal => {
    if (!admin) return;
    setReadLoading(true); setReadError('');
    try {
      const response = await fetch(api(`orders/${orderId}`), { signal });
      if (!response.ok) throw new Error('Unable to load delivery details.');
      const order = await response.json();
      if (!signal?.aborted) setScanOrder(previous => ({ ...previous, ...order }));
    } catch (err) { if (!signal?.aborted) setReadError(err.message); }
    finally { if (!signal?.aborted) setReadLoading(false); }
  }, [admin, orderId]);
  useEffect(() => {
    const controller = new AbortController();
    fetchAdminOrder(controller.signal);
    return () => controller.abort();
  }, [fetchAdminOrder]);
  const job = useMemo(() => {
    if (!admin) return enrichJobsWithAppointmentWindow(jobs).find(item => item.id === orderId);
    if (scanOrder?.id !== orderId) return null;
    return {
      ...scanOrder, status: scanOrder.order_status || scanOrder.status, customer_name: scanOrder.customers?.full_name || scanOrder.customer_name,
      customer_phone: scanOrder.customers?.phone || scanOrder.customer_phone, time: scanOrder.scheduled_start_date_time || scanOrder.time,
      assigned_date: scanOrder.time_slots?.date || new Date(scanOrder.scheduled_start_date_time).toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }),
      address: [scanOrder.delivery_address, scanOrder.delivery_city, scanOrder.delivery_postcode].filter(Boolean).join(', ') || scanOrder.address,
    };
  }, [jobs, orderId, admin, scanOrder]);
  const [action, setAction] = useState(null);
  const [data, setData] = useState(null);
  const [itemError, setItemError] = useState(null);
  const [scanItem, setScanItem] = useState(null);
  const [scanning, setScanning] = useState(false);
  const scanningRef = useRef(false);
  const [routeStop, setStop] = useState(initialStop || location.state?.stop || null);
  const stop = useDeliveryStop(job, routeStop);
  const refreshItems = useCallback(async () => {
    try {
      const response = await fetch(api(`orders/${orderId}/loading-status`), { headers: { 'ngrok-skip-browser-warning': '1' } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to load items.');
      setData(result);
      setItemError(null);
    } catch (err) { setItemError(err.message); }
  }, [orderId]);

  useEffect(() => {
    if (!job) return;
    refreshItems();
    const timer = setInterval(refreshItems, 15000);
    return () => clearInterval(timer);
  }, [job, refreshItems]);

  useEffect(() => {
    if (!job?.time_slot_id) return;
    let cancelled = false;
    fetch(api(`driver/route/${job.time_slot_id}?employee_id=${encodeURIComponent(employeeId)}`), { headers: { 'ngrok-skip-browser-warning': '1' } })
      .then(response => response.ok ? response.json() : null)
      .then(route => {
        const fresh = route?.stops?.find(item => item.order_id === orderId);
        if (!cancelled && fresh) setStop(fresh);
      }).catch(() => {});
    return () => { cancelled = true; };
  }, [job?.time_slot_id, employeeId, orderId]);

  async function scan(serial) {
    if (scanningRef.current || !scanItem || scanItem.handling_status !== 'loaded' || !serial?.trim()) return;
    scanningRef.current = true;
    setScanning(true);
    setItemError(null);
    try {
      // Same endpoint, stages and serial checks used by Scan Station.
      const response = await fetch(api(`order-products/${scanItem.id}/handling-status`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
        body: JSON.stringify({ employee_id: employeeId, stage: 'unloading', serial_number: serial.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Scan failed.');
      setScanItem(null);
      await refreshItems();
      await refresh();
      await fetchAdminOrder();
    } catch (err) {
      setScanItem(null);
      setItemError(err.message);
    } finally {
      scanningRef.current = false;
      setScanning(false);
    }
  }

  function updated() {
    setAction(null);
    refresh();
    refreshItems();
    fetchAdminOrder();
  }

  return <div ref={pageRef} className={`mx-auto ${onClose ? 'min-h-0' : 'min-h-screen'} max-w-3xl bg-gray-50 pb-6`}>
    <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2 shadow-sm">
      {onClose ? <><p className="text-sm font-semibold text-gray-800">Delivery details</p><button type="button" autoFocus onClick={onClose} aria-label="Close delivery details" className="ml-auto flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-200"><X className="h-5 w-5" /></button></> : <button type="button" onClick={() => navigate(location.state?.returnTo || `/driver${job?.assigned_date ? `?date=${job.assigned_date}` : ''}`)} className="flex min-h-11 items-center gap-2 text-sm font-semibold text-gray-700"><ArrowLeft className="h-4 w-4" /> Back</button>}
      <h1 className="sr-only">Delivery details</h1>
    </div>
    {loading || (readLoading && !job) ? <p className="p-6 text-sm text-gray-500">Loading delivery…</p> : error || readError ? <p role="alert" className="p-4 text-red-600">{error || readError}</p> : !job ? <p className="p-6 text-gray-500">Delivery not available for this driver.</p> : <div className="space-y-4 px-4">
      <OrderTaskCard summary job={job} onNavigate={() => navigateToDelivery(job, stop)} onUpdate={() => setAction('update')} onViewEvidence={() => setAction('evidence')} onReport={() => setAction('report')} onFail={() => setAction('fail')}>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs sm:grid-cols-4">
          <div><dt className="text-gray-400">ETA</dt><dd className="mt-1 font-medium text-blue-700">{deliveryTime(stop?.eta || job.time)}</dd></div>
          <div><dt className="text-gray-400">Access</dt><dd className="mt-1 text-gray-700">{stop?.access_window_start || '—'}–{stop?.access_window_end || '—'}</dd></div>
          <div><dt className="text-gray-400">Work</dt><dd className="mt-1 text-gray-700">{stop?.work_type || '—'}</dd></div>
          <div><dt className="text-gray-400">Service</dt><dd className="mt-1 text-gray-700">{stop?.work_duration_min != null ? `${stop.work_duration_min} min` : '—'}</dd></div>
        </dl>
      </OrderTaskCard>
      <section aria-label="Delivery items">
        <h2 className="mb-2 text-sm font-semibold text-gray-800">Items{data ? ` (${data.items.length})` : ''}</h2>
        {itemError && <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{itemError} <button type="button" onClick={refreshItems} className="ml-2 underline">Refresh</button></p>}
        {!data ? <p className="text-sm text-gray-400">Loading items…</p> : !data.items.length ? <p className="text-sm text-gray-400">No items</p> : <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
          {data.items.map(item => {
            const status = item.handling_status || 'pending';
            const serial = item.unloaded_serial || item.loaded_serial || item.assigned_serial;
            const name = item.products?.product_name || item.odoo_product_name || `Item ${item.id}`;
            return <article key={item.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 text-sm font-semibold text-gray-800">{name} <span className="font-normal text-gray-400">×{item.quantity || 1}</span></p>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium capitalize ${itemColors[status] || itemColors.pending}`}>{status}</span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="min-w-0 break-all font-mono text-xs text-gray-500">{serial || 'No serial assigned'}</p>
                {status === 'loaded' && <button type="button" onClick={() => setScanItem({ ...item, handling_status: status })} disabled={scanning || isTerminal(job.status)} aria-label={`Scan ${name}`} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white disabled:bg-gray-100 disabled:text-gray-400">{scanning ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} Unload</button>}
              </div>
            </article>;
          })}
        </div>}
      </section>
      {action === 'update' && <UpdateOrderModal order={job} employeeId={employeeId} onClose={() => setAction(null)} onSuccess={updated} />}
      {action === 'evidence' && <DeliveryEvidenceModal order={job} onClose={() => setAction(null)} onSuccess={updated} />}
      {action === 'report' && <ContactReportModal job={job} employeeId={employeeId} onClose={() => setAction(null)} onSuccess={updated} />}
      {action === 'fail' && <FailDeliveryModal order={job} employeeId={employeeId} onClose={() => setAction(null)} onSuccess={updated} />}
      {scanItem && <ScannerModal itemName={scanItem.products?.product_name || scanItem.odoo_product_name} productId={scanItem.product_id} onScan={scan} onClose={() => { if (!scanningRef.current) setScanItem(null); }} />}
    </div>}
  </div>;
}
