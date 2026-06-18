import { X, ExternalLink, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import TripDetailHeader from './TripDetailHeader';
import TripTeamContacts from './TripTeamContacts';
import TripOrderTable from './TripOrderTable';

/**
 * Responsive trip detail drawer.
 * - Mobile (< md): full-screen overlay
 * - Desktop (md+): right side-panel (w-[720px])
 *
 * @param {{ trip: object|null, loading: boolean, error: string|null, onClose: () => void, refresh: () => void }}
 */
export default function TripDetailDrawer({ trip, loading, error, onClose, refresh }) {
  const navigate = useNavigate();

  return (
    <>
      {/* Backdrop — mobile only */}
      <div
        className="fixed inset-0 bg-black/30 z-30 md:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="fixed inset-0 z-40 flex flex-col bg-white md:inset-auto md:right-0 md:top-0 md:bottom-0 md:w-[720px] md:shadow-2xl md:border-l md:border-gray-200">
        {/* Header bar */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-white flex-shrink-0">
          <h2 className="text-base font-semibold text-gray-900">Trip Detail</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              disabled={loading}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-40"
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {loading && !trip && (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
            </div>
          )}

          {error && (
            <div className="m-5 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {trip && (
            <>
              <TripDetailHeader trip={trip} />
              <TripTeamContacts trip={trip} />
              <div className="p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  Orders ({trip.orders?.items?.length ?? 0})
                </h3>
                <TripOrderTable items={trip.orders?.items || []} trip={trip} />
              </div>
            </>
          )}
        </div>

        {/* Footer links */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-gray-100 bg-gray-50 flex-shrink-0">
          <button
            onClick={() => navigate('/delivery')}
            className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Delivery Schedule
          </button>
          <span className="text-gray-300">|</span>
          <button
            onClick={() => navigate('/cases/sync-monitor')}
            className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Sync Monitor
          </button>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </>
  );
}
