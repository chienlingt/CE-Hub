import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function ScopeMonthSelector({
  scope,
  onScopeChange,
  selectedMonthDate,
  onPrevMonth,
  onNextMonth,
  formatMonthYear,
  className = ''
}) {
  return (
    <div className={`flex items-center space-x-3 ${className}`}>
      <div className="inline-flex items-center rounded-md border border-gray-200 bg-white p-1">
        <button
          onClick={() => onScopeChange('month')}
          className={`px-3 py-1 text-xs font-medium rounded ${scope === 'month' ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:text-gray-800'}`}
        >
          Selected month
        </button>
        <button
          onClick={() => onScopeChange('all')}
          className={`px-3 py-1 text-xs font-medium rounded ${scope === 'all' ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:text-gray-800'}`}
        >
          All time
        </button>
      </div>
      <button
        onClick={onPrevMonth}
        className="inline-flex items-center px-3 py-2 bg-white border border-gray-200 rounded-md shadow-sm hover:bg-gray-50"
        title="Previous month"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <div className="text-sm font-medium">{formatMonthYear(selectedMonthDate)}</div>

      <button
        onClick={onNextMonth}
        className="inline-flex items-center px-3 py-2 bg-white border border-gray-200 rounded-md shadow-sm hover:bg-gray-50"
        title="Next month"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
