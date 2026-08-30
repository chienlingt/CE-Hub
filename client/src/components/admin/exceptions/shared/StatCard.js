// Summary stat block used at the top of the Exceptions views.
import React from 'react';

const TONES = {
  red:    'bg-red-100 text-red-600',
  orange: 'bg-orange-100 text-orange-600',
  purple: 'bg-purple-100 text-purple-600',
  green:  'bg-green-100 text-green-600',
  blue:   'bg-blue-100 text-blue-600',
  gray:   'bg-gray-100 text-gray-600',
};

export default function StatCard({ label, value, icon: Icon, tone = 'gray' }) {
  const toneCls = TONES[tone] || TONES.gray;
  return (
    <div className="bg-white rounded-lg shadow p-4 flex items-center gap-3">
      <div className={`p-2 rounded-lg ${toneCls}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}
