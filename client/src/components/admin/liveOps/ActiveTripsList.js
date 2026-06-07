import ActiveTripCard from './ActiveTripCard';
import LiveOpsEmptyState from './LiveOpsEmptyState';

/**
 * @param {{ trips: Array, onTripClick: (trip: object) => void, selectedTripId?: string }}
 */
export default function ActiveTripsList({ trips, onTripClick, selectedTripId }) {
  if (trips.length === 0) return <LiveOpsEmptyState />;

  return (
    <div className="space-y-3">
      {trips.map(trip => (
        <div
          key={trip.id}
          className={selectedTripId === trip.id ? 'ring-2 ring-orange-500 ring-offset-1 rounded-lg' : ''}
        >
          <ActiveTripCard trip={trip} onClick={onTripClick} />
        </div>
      ))}
    </div>
  );
}
