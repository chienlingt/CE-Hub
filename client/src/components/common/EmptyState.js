import React from 'react';
import { Inbox } from 'lucide-react';

/**
 * Generalised from admin/liveOps/LiveOpsEmptyState.js. Flat and quiet — an
 * empty state should explain, not decorate.
 */
export default function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action = null,
  className = '',
}) {
  return (
    <div className={`rounded-md border border-gray-200 bg-white p-10 text-center ${className}`}>
      <Icon className="mx-auto mb-3 h-8 w-8 text-gray-300" aria-hidden="true" />
      <p className="text-sm font-medium text-gray-700">{title}</p>
      {description && (
        <p className="mx-auto mt-1 max-w-md text-xs text-gray-500">{description}</p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
