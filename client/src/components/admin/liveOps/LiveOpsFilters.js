import { Search, Calendar, X, AlertTriangle } from 'lucide-react';
import { todayLocalDateKey } from '../../../utils/dateKey';

/**
 * Filter bar for Live Deliveries: date chips + overdue + search input.
 *
 * @param {{
 *   dateFilter: 'today'|'all'|'overdue'|string,
 *   onDateFilter: (v: string) => void,
 *   searchQuery: string,
 *   onSearchQuery: (v: string) => void,
 *   overdueCount?: number,
 * }}
 */
export default function LiveOpsFilters({ dateFilter, onDateFilter, searchQuery, onSearchQuery, overdueCount = 0 }) {
  const today = todayLocalDateKey();
  const isSpecificDate = dateFilter !== 'today' && dateFilter !== 'all' && dateFilter !== 'overdue';

  function handleDatePick(e) {
    const val = e.target.value;
    if (!val) {
      onDateFilter('today');
    } else {
      onDateFilter(val);
    }
  }

  return (
    <div className="mb-4 space-y-2">
      {/* Date chips row */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => onDateFilter('today')}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
            dateFilter === 'today'
              ? 'bg-orange-500 text-white border-orange-500'
              : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
          }`}
        >
          Today
        </button>
        <button
          onClick={() => onDateFilter('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
            dateFilter === 'all'
              ? 'bg-orange-500 text-white border-orange-500'
              : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
          }`}
        >
          All dates
        </button>
        <button
          onClick={() => onDateFilter('overdue')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
            dateFilter === 'overdue'
              ? 'bg-red-600 text-white border-red-600'
              : overdueCount > 0
                ? 'bg-red-50 text-red-700 border-red-300 hover:bg-red-100'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
          }`}
        >
          <AlertTriangle className="h-3 w-3 shrink-0" />
          Overdue
          {overdueCount > 0 && (
            <span className={`min-w-[1.25rem] px-1 py-0.5 rounded-full text-[10px] font-bold leading-none ${
              dateFilter === 'overdue' ? 'bg-white/25 text-white' : 'bg-red-600 text-white'
            }`}>
              {overdueCount}
            </span>
          )}
        </button>

        {/* Date picker */}
        <div className="relative flex items-center">
          <Calendar className="absolute left-2.5 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
          <input
            type="date"
            value={isSpecificDate ? dateFilter : ''}
            max={today}
            onChange={handleDatePick}
            className={`pl-8 pr-2 py-1.5 rounded-full text-xs border transition-colors focus:outline-none focus:ring-2 focus:ring-orange-400
              ${isSpecificDate
                ? 'bg-orange-500 text-white border-orange-500'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
          />
        </div>

        {/* Clear date pill when a specific date is active */}
        {isSpecificDate && (
          <button
            onClick={() => onDateFilter('today')}
            className="flex items-center gap-1 px-2 py-1 rounded-full text-xs text-gray-500 border border-gray-200 hover:bg-gray-50 transition-colors"
            title="Back to today"
          >
            <X className="h-3 w-3" />
            {dateFilter}
          </button>
        )}
      </div>

      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => onSearchQuery(e.target.value)}
          placeholder="Search by order ref or customer…"
          className="w-full pl-9 pr-9 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            title="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
