import React from 'react';
import { CalendarCheck } from 'lucide-react';
import Button from '../../../common/Button';

// One recommended option: date + window and a one-line reason. No lorry number
// is shown (plan B9) — the lorry is only used for ranking and highlighting.
export default function RecommendationCard({ option, rank, onShowOnBoard }) {
  return (
    <li className="rounded-md border border-gray-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-500">Option {rank}</p>
          <p className="text-sm font-semibold text-gray-900">{option.label}</p>
          {option.reason && <p className="mt-0.5 text-xs text-gray-600">{option.reason}</p>}
        </div>
        <Button variant="secondary" size="sm" icon={CalendarCheck} onClick={() => onShowOnBoard(option)}>
          Show on Board
        </Button>
      </div>
    </li>
  );
}
