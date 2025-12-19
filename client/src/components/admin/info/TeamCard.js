import React from 'react';

const TeamCard = ({ team, members, onEdit, onDelete, saving }) => {
    const { id, team_type } = team;
    const activeMembers = members.filter(m => m.active_flag);
    const memberCount = activeMembers.length;

    return (
        <div className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow duration-200">
            <div className="flex justify-between items-start mb-3">
                <div>
                    <h3 className="font-semibold text-gray-800">{team_type}</h3>
                    <p className="text-sm text-gray-500">
                        {memberCount} active member{memberCount !== 1 ? 's' : ''}
                        {members.length !== activeMembers.length && (
                            <span className="text-gray-400">
                                {' '}({members.length - activeMembers.length} inactive)
                            </span>
                        )}
                    </p>
                </div>
                <div className="flex gap-1">
                    <button
                        onClick={() => onEdit(team)}
                        className="text-blue-600 hover:bg-blue-50 p-1 rounded transition-colors duration-200"
                        title="Edit Team"
                        disabled={saving}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                    </button>
                    <button
                        onClick={() => onDelete(id)}
                        className="text-red-600 hover:bg-red-50 p-1 rounded transition-colors duration-200"
                        title="Delete Team"
                        disabled={saving || members.length > 0}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
            </div>

            {members.length > 0 ? (
                <div className="space-y-2">
                    <h4 className="text-xs font-medium text-gray-600 uppercase tracking-wider">Members:</h4>
                    <div className="space-y-1">
                        {members.map(member => (
                            <div key={member.id} className="flex justify-between items-center text-sm">
                                <span className={member.active_flag ? "text-gray-800" : "text-gray-400"}>
                                    {member.name}
                                </span>
                                <span className={`text-xs px-2 py-1 rounded ${member.active_flag
                                        ? "bg-green-100 text-green-700"
                                        : "bg-gray-100 text-gray-500"
                                    }`}>
                                    {member.role.name}
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
