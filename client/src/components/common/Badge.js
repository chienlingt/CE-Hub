import React from 'react';

export function StatusBadge({ isActive, trueText = 'Active', falseText = 'Inactive' }) {
    return isActive
        ? (
            <span className="inline-flex items-center px-2 py-1 rounded-full bg-green-100 text-green-800 font-medium gap-1 text-xs">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span> {trueText}
            </span>
        )
        : (
            <span className="inline-flex items-center px-2 py-1 rounded-full bg-red-100 text-red-700 font-medium gap-1 text-xs">
                <span className="w-2 h-2 bg-red-500 rounded-full"></span> {falseText}
            </span>
        );
}

export function TeamBadge({ teamType }) {
    const getTeamStyle = (type) => {
        if (!type) return 'bg-gray-100 text-gray-800';

        const lowerType = type.toLowerCase();
        if (lowerType.includes('delivery')) return 'bg-blue-100 text-blue-800';
        if (lowerType.includes('installation')) return 'bg-purple-100 text-purple-800';
        if (lowerType.includes('warehouse')) return 'bg-orange-100 text-orange-800';
        return 'bg-gray-100 text-gray-800';
    };

    return (
        <span className={`inline-flex items-center px-2 py-1 rounded-full font-medium text-xs ${getTeamStyle(teamType)}`}>
            {teamType || 'Unassigned'}
        </span>
    );
}
