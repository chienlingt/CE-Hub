// client/src/components/driver/DateCalendarModal.js
import { useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function toDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * @param {{
 *   value: string,
 *   onChange: (dateKey: string) => void,
 *   onClose: () => void,
 * }}
 */
export default function DateCalendarModal({ value, onChange, onClose }) {
  const initial = value ? new Date(value + 'T00:00:00') : new Date();
  const [viewMonth, setViewMonth] = useState(
    () => new Date(initial.getFullYear(), initial.getMonth(), 1)
  );

  const today = toDateKey(new Date());
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const monthLabel = viewMonth.toLocaleDateString('en-MY', { month: 'long', year: 'numeric' });

  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function selectDay(day) {
    onChange(toDateKey(new Date(year, month, day)));
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 bg-white w-full max-w-sm rounded-t-2xl sm:rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-800">Pick a date</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4">
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={() => setViewMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-sm font-semibold text-gray-800">{monthLabel}</span>
            <button
              type="button"
              onClick={() => setViewMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
              aria-label="Next month"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map(label => (
              <div key={label} className="text-center text-xs font-medium text-gray-400 py-1">
                {label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, idx) => {
              if (day === null) {
                return <div key={`empty-${idx}`} />;
              }

              const key = toDateKey(new Date(year, month, day));
              const isSelected = key === value;
              const isToday = key === today;

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => selectDay(day)}
                  className={`
                    aspect-square flex items-center justify-center rounded-xl text-sm font-medium transition-colors
                    ${isSelected
                      ? 'bg-blue-600 text-white'
                      : isToday
                        ? 'text-blue-600 ring-1 ring-blue-300 hover:bg-blue-50'
                        : 'text-gray-700 hover:bg-gray-100'}
                  `}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
