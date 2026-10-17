import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../utils/apiBaseUrl';

// Completed/failed orders are intentionally absent from the active-route API.
// Read their existing order/item/building data for display without changing
// which orders participate in optimisation or manual arrangement.
let buildingsRequest;
const read = async path => {
  const response = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/api/${path}`, { headers: { 'ngrok-skip-browser-warning': '1' } });
  if (!response.ok) throw new Error('Delivery information unavailable');
  return response.json();
};

export default function useDeliveryStop(job, suppliedStop) {
  const [fallback, setFallback] = useState(null);
  const id = job?.id;
  useEffect(() => {
    if (suppliedStop || !id) return;
    let cancelled = false;
    setFallback(null);
    if (!buildingsRequest) buildingsRequest = read('buildings').catch(error => { buildingsRequest = null; throw error; });
    Promise.all([read(`orders/${id}`), read(`orders/${id}/loading-status`), buildingsRequest])
      .then(([order, data, buildings]) => {
        if (cancelled) return;
        const building = buildings.find(item => item.id === order.building_id);
        const minutes = order.scheduled_start_date_time && order.scheduled_end_date_time
          ? Math.max(0, Math.round((new Date(order.scheduled_end_date_time) - new Date(order.scheduled_start_date_time)) / 60000)) : null;
        setFallback({
          order_id: id, eta: order.scheduled_start_date_time,
          access_window_start: building?.access_time_window_start,
          access_window_end: building?.access_time_window_end,
          latitude: building?.latitude != null ? Number(building.latitude) : null,
          longitude: building?.longitude != null ? Number(building.longitude) : null,
          work_type: data.items.some(item => item.service_type === 'delivery_installation') ? 'Delivery + installation' : 'Delivery',
          work_duration_min: minutes,
        });
      }).catch(() => {});
    return () => { cancelled = true; };
  }, [id, suppliedStop]);
  return suppliedStop || (fallback?.order_id === id ? fallback : null);
}
