import { Navigation, RefreshCw } from 'lucide-react';

function formatTime(date) {
  if (!date) return null;
  return date.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function LiveOpsHeader({ count, lastUpdated, onRefresh, loading }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-orange-100 rounded-lg">
          <Navigation className="h-5 w-5 text-orange-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            Live Deliveries
            {count > 0 && (
              <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-semibold rounded-full">
                {count}
              </span>
            )}
          </h1>
          <p className="text-sm text-gray-500">Slots currently out for delivery</p>
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-400">
        {lastUpdated && <span>Updated {formatTime(lastUpdated)}</span>}
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>
    </div>
  );
}
