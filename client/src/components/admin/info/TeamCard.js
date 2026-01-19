import React from 'react';

const TeamCard = ({ team, members, onEdit, onDelete, saving }) => {
    const { id, team_type, available_flag = true } = team; // Default to true for existing teams
    const activeMembers = members.filter(m => m.active_flag);
    const memberCount = activeMembers.length;
    const getMemberName = (member) => member?.name || member?.display_name || "Unknown";
    const getMemberRole = (member) => member?.role?.name || member?.roleName || member?.role || "Unassigned";

    const isInactive = !available_flag;

    return (
        <div className={`border rounded-lg p-4 transition-shadow duration-200 ${isInactive ? 'bg-gray-200' : 'hover:shadow-md'}`}>
            <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                    <h3 className={`font-semibold ${isInactive ? 'text-gray-500' : 'text-gray-800'}`}>{team_type}</h3>
                    <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${isInactive
                            ? 'bg-red-100 text-red-700'
                            : 'bg-green-100 text-green-700'
                            }`}
                    >
                        {isInactive ? 'Inactive' : 'Active'}
                    </span>
                </div>
                <div className="flex gap-1">
                    <button
                        onClick={() => onEdit(team)}
                        className="text-blue-600 hover:bg-blue-50 p-1 rounded transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Edit Team"
                        disabled={saving || isInactive}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                    </button>
                    <button
                        onClick={() => onDelete(id)}
                        className="text-red-600 hover:bg-red-50 p-1 rounded transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Delete Team"
                        disabled={saving || isInactive}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
            </div>

            <p className={`text-sm mb-3 ${isInactive ? 'text-gray-400' : 'text-gray-500'}`}>
                {memberCount} active member{memberCount !== 1 ? 's' : ''}
                {members.length !== activeMembers.length && (
                    <span className="text-gray-400">
                        {' '}({members.length - activeMembers.length} inactive)
                    </span>
                )}
            </p>

            {members.length > 0 ? (
                <div className="space-y-2">
                    <h4 className="text-xs font-medium text-gray-600 uppercase tracking-wider">Members:</h4>
                    <div className="space-y-1">
                        {members.map(member => (
                            <div key={member.id} className="flex justify-between items-center text-sm">
                                <span className={member.active_flag ? "text-gray-800" : "text-gray-400"}>
                                    {getMemberName(member)}
                                </span>
                                <span className={`text-xs px-2 py-1 rounded ${member.active_flag
                                        ? "bg-green-100 text-green-700"
                                        : "bg-gray-100 text-gray-500"
                                    }`}>
                                    {getMemberRole(member)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <p className="text-xs text-gray-400 italic">No members assigned</p>
            )}
        </div>
    );
};

export default TeamCard;
