import { ArrowDown, ArrowUp, GripVertical, Navigation } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { statusBadge } from '../../utils/driverStatusMap';
import useDeliveryStop from '../../hooks/useDeliveryStop';

export function deliveryTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' });
}

export function navigateToDelivery(job, stop) {
  const destination = stop?.latitude != null && stop?.longitude != null
    ? `${stop.latitude},${stop.longitude}` : job.address || stop?.address;
  if (destination) window.open(`https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', destination, travelmode: 'driving', dir_action: 'navigate' })}`, '_blank', 'noopener,noreferrer');
}

export function sortDeliveryCards(jobs, stops = []) {
  const rank = new Map(stops.map((stop, index) => [stop.order_id, index]));
  const tier = job => ['Delivered', 'Installing'].includes(job.status) ? 2 : job.status === 'Failed' ? 1 : 0;
  return [...jobs].sort((a, b) => tier(a) - tier(b) ||
    (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER));
}

export default function DriverDeliveryCard({ job, stop: suppliedStop, nextStop = false, arranging = false, position, onMove, first, last, locked = false, dragging = false, dropTarget = false, onTouchDragStart, onTouchDragMove, onTouchDragEnd, onTouchDragCancel, detailBasePath = '/driver/delivery', compactDesktop = false, onOpenDetails, ...dragProps }) {
  const stop = useDeliveryStop(job, suppliedStop);
  const navigate = useNavigate();
  const badge = statusBadge(job.status);
  const completed = ['Delivered', 'Installing'].includes(job.status);
  const quiet = completed || job.status === 'Failed';
  const Content = arranging ? 'div' : 'button';
  const open = () => {
    if (onOpenDetails && window.matchMedia('(min-width: 1024px)').matches) onOpenDetails(job, stop);
    else navigate(`${detailBasePath}/${job.id}`, { state: { scanOrder: job, stop, returnTo: `/driver?date=${job.assigned_date}` } });
  };
  const workDuration = stop?.work_duration_min ?? (stop?.eta && stop?.service_end_at
    ? Math.max(0, Math.round((new Date(stop.service_end_at) - new Date(stop.eta)) / 60000)) : null);

  return (
    <article {...dragProps} data-stop-id={job.id} className={`relative border-b border-gray-100 p-4 last:border-b-0 ${compactDesktop ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_8.5rem] lg:items-center lg:gap-x-4 lg:px-4 lg:py-3' : ''} ${nextStop && !arranging ? 'border-l-4 border-l-blue-500 bg-blue-50/40 pl-3' : quiet ? 'bg-gray-50/70' : 'bg-white'} ${arranging ? 'cursor-grab select-none active:cursor-grabbing' : ''} ${dragging ? 'opacity-40' : ''} ${dropTarget && !dragging ? 'ring-2 ring-inset ring-blue-500 bg-blue-50' : ''}`}>
      <span className={`absolute right-4 top-4 rounded-full px-2 py-1 text-[11px] font-semibold ${badge.color}`}>{job.status === 'Failed' ? 'Failed' : badge.label}</span>
      <div className={`flex min-w-0 items-start gap-3 ${compactDesktop ? 'lg:items-center' : ''}`}>
        {arranging && <button type="button" disabled={locked} aria-label={`Drag ${job.customer_name || 'delivery'} to rearrange`} title="Drag to rearrange" style={{ touchAction: 'none' }} onPointerDown={onTouchDragStart} onPointerMove={onTouchDragMove} onPointerUp={onTouchDragEnd} onPointerCancel={onTouchDragCancel} className="flex h-10 w-7 shrink-0 cursor-grab items-center justify-center rounded-lg bg-blue-50 text-blue-600 active:cursor-grabbing disabled:opacity-30"><GripVertical className="h-4 w-4" /></button>}
        <Content type={arranging ? undefined : 'button'} onClick={arranging ? undefined : open} className={`min-w-0 flex-1 text-left focus-visible:outline-blue-600 ${compactDesktop ? 'lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-center lg:gap-x-5' : ''}`}>
          <div className="min-w-0">
          <div className={`min-h-7 pr-28 ${compactDesktop ? 'lg:min-h-0 lg:pr-0' : ''}`}>
            <p className={`min-w-0 text-base font-semibold ${compactDesktop ? 'lg:text-sm' : ''} ${quiet ? 'text-gray-600' : 'text-gray-900'}`}>{job.customer_name || 'Customer'}</p>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="font-mono text-[11px] text-gray-400">{job.odoo_order_ref || 'Not synced'}</p>
            {nextStop && !arranging && <span className="text-[10px] font-semibold text-blue-600">Next stop</span>}
          </div>
          <p title={job.address || stop?.address} className={`mt-1 text-sm leading-5 text-gray-500 ${compactDesktop ? 'lg:line-clamp-2 lg:text-xs lg:leading-4' : ''}`}>{job.address || stop?.address || 'Address unavailable'}</p>
          </div>
          <dl className={`mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4 ${compactDesktop ? 'lg:mt-0 lg:grid-cols-2 lg:gap-x-3 lg:gap-y-1.5 lg:border-l lg:border-slate-100 lg:pl-4 xl:grid-cols-4' : ''}`}>
            <div><dt className="text-gray-400">ETA</dt><dd className="mt-0.5 font-medium text-blue-700">{deliveryTime(stop?.eta || job.time)}</dd></div>
            <div><dt className="text-gray-400">Access</dt><dd className="mt-0.5 text-gray-700">{stop?.access_window_start || stop?.access_window_end ? `${stop.access_window_start || '—'}–${stop.access_window_end || '—'}` : '—'}</dd></div>
            <div><dt className="text-gray-400">Work</dt><dd className="mt-0.5 text-gray-700">{stop?.work_type || '—'}</dd></div>
            <div><dt className="text-gray-400">Service</dt><dd className="mt-0.5 text-gray-700">{workDuration != null ? `${workDuration} min` : '—'}</dd></div>
          </dl>
        </Content>
      </div>
      <div className={`mt-3 flex flex-wrap items-center justify-between gap-2 ${compactDesktop ? 'lg:mt-0 lg:flex-col lg:items-end lg:justify-end lg:gap-2 lg:pt-8' : ''}`}>
        <p className={`text-xs text-gray-400 ${compactDesktop ? 'lg:text-right lg:text-[11px]' : ''}`}>{stop?.segment ? `${Math.round(stop.segment.travel_time_s / 60)} min drive · ${(stop.segment.distance_m / 1000).toFixed(1)} km` : ''}</p>
        {arranging ? <div className="flex gap-2">
          <button type="button" aria-label="Move delivery earlier" title="Move up" disabled={first || locked} onClick={() => onMove(position, position - 1)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-300"><ArrowUp className="h-4 w-4" /></button>
          <button type="button" aria-label="Move delivery later" title="Move down" disabled={last || locked} onClick={() => onMove(position, position + 1)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-300"><ArrowDown className="h-4 w-4" /></button>
        </div> : <button type="button" onClick={() => navigateToDelivery(job, stop)} disabled={!job.address && !stop?.address && stop?.latitude == null} className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold disabled:opacity-40 ${compactDesktop ? 'lg:min-h-9' : ''} ${nextStop ? 'bg-blue-600 text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-100'}`}><Navigation className="h-3.5 w-3.5" /> Navigate</button>}
      </div>
    </article>
  );
}
