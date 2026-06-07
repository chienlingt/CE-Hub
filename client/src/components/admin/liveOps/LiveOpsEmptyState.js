import { Truck } from 'lucide-react';

export default function LiveOpsEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-gray-400">
      <Truck className="h-12 w-12 mb-3" />
      <p className="text-base font-medium text-gray-500">No trucks currently out for delivery</p>
      <p className="text-sm mt-1 text-center max-w-xs">
        Trips appear here after a driver taps <strong className="text-gray-600">Leave warehouse</strong> on their dashboard.
      </p>
    </div>
  );
}
