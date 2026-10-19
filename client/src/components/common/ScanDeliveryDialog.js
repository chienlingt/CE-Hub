import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import DriverDeliveryDetail from '../driver/DriverDeliveryDetail';

export default function ScanDeliveryDialog({ order, stop, onClose, scanStation = true }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    return () => { dialog.close(); document.body.style.overflow = overflow; };
  }, []);

  return createPortal(<dialog ref={dialogRef} aria-label="Delivery details"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => {
      const box = event.currentTarget.getBoundingClientRect();
      if (event.target === event.currentTarget && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) onClose();
    }}
    className="m-auto w-[min(52rem,calc(100vw-3rem))] overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 p-0 shadow-2xl backdrop:bg-slate-900/40">
    <div data-page-scroll className="max-h-[88dvh] overflow-y-auto">
      <DriverDeliveryDetail scanStation={scanStation} detailOrderId={order.id} initialOrder={order} initialStop={stop} onClose={onClose} />
    </div>
  </dialog>, document.body);
}
