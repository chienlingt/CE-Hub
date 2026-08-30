import React from 'react';
import { StatusBadge, RoleBadge } from '../../common/Badge';
import { getTeamPairStatus, getTeamPairStatusStyle, getTeamPairStatusLabel } from '../../../utils/teamPairStatus';

const MAX_VISIBLE_MEMBERS = 4;

function isDeliveryTeamType(teamType) {
    return (teamType || '').toLowerCase().includes('delivery');
}

function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/).slice(0, 2);
    return parts.map(p => p[0]).join('').toUpperCase() || '?';
}

const ICON_BUTTON_CLASSES = "cursor-pointer p-1 rounded transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-500";

const EditIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
);

const DeleteIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);

const PersonIcon = () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 12a4 4 0 100-8 4 4 0 000 8zm0 2c-4.418 0-8 2.239-8 5v1h16v-1c0-2.761-3.582-5-8-5z" />
    </svg>
);

const PAIR_STATUS_PILL_CLASSES = {
    ready: 'bg-green-100 text-green-800',
    incomplete: 'bg-amber-100 text-amber-800',
    empty: 'bg-gray-100 text-gray-500',
};

// A labeled Ready/Incomplete/Empty pill — a small colored dot alone is too easy to miss
// at a glance, and color-only meaning fails contrast/color-blind accessibility, so the
// dot always ships with its text label.
const PairStatusPill = ({ status }) => (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${PAIR_STATUS_PILL_CLASSES[status]}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${getTeamPairStatusStyle(status)}`} />
        {getTeamPairStatusLabel(status)}
    </span>
);

// One Primary Driver / Assistant Driver slot: an avatar + name when assigned, or a dashed
// placeholder + "+ Assign ..." link when empty. Role label always sits on its own line so
// it never has to squeeze onto the same line as the name/link.
const PairSlot = ({ role, employee, placeholder, onAssign, disabled, accentClasses }) => (
    <div className="flex-1 min-w-0 py-3">
        <RoleBadge role={role} />
        <div className="mt-2 flex items-center gap-2 min-w-0">
            {employee ? (
                <>
                    <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold ${accentClasses}`}>
                        {getInitials(employee.name || employee.display_name)}
                    </span>
                    <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{employee.name || employee.display_name}</p>
                        {employee.contact_number && (
                            <p className="text-xs text-gray-500 truncate">{employee.contact_number}</p>
                        )}
                    </div>
                </>
            ) : (
                <>
                    <span className="flex-shrink-0 w-7 h-7 rounded-full border border-dashed border-gray-300 flex items-center justify-center text-gray-300">
                        <PersonIcon />
                    </span>
                    <button
                        type="button"
                        onClick={onAssign}
                        disabled={disabled}
                        className="cursor-pointer text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                    >
                        {placeholder}
                    </button>
                </>
            )}
        </div>
    </div>
);

const TeamCard = ({ team, members, onEdit, onDelete, saving }) => {
    const { id, team_type, available_flag = true, primary_driver, assistant_driver, truck } = team;
    const isInactive = !available_flag;
    const isDeliveryTeam = isDeliveryTeamType(team_type);
    const pairStatus = getTeamPairStatus(team);

    const activeMembers = members.filter(m => m.active_flag);
    const memberCount = activeMembers.length;
    const inactiveCount = members.length - activeMembers.length;
    const visibleMembers = members.slice(0, MAX_VISIBLE_MEMBERS);
    const hiddenMemberCount = members.length - visibleMembers.length;
    const getMemberName = (member) => member?.name || member?.display_name || "Unknown";
    const getMemberRole = (member) => member?.role?.name || member?.roleName || member?.role || "Unassigned";

    return (
        <div className={`flex flex-col h-full rounded-lg border p-4 transition-shadow duration-200 motion-reduce:transition-none ${isInactive ? 'bg-gray-100 border-gray-200' : 'bg-white border-gray-200 hover:shadow-md'}`}>
            <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                    <h3 className={`font-semibold truncate ${isInactive ? 'text-gray-500' : 'text-gray-900'}`}>{team_type}</h3>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <StatusBadge isActive={!isInactive} />
                        {isDeliveryTeam && <PairStatusPill status={pairStatus} />}
                    </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                    <button
                        onClick={() => onEdit(team)}
                        className={`text-blue-600 hover:bg-blue-50 ${ICON_BUTTON_CLASSES}`}
                        title="Edit Team"
                        disabled={saving || isInactive}
                    >
                        <EditIcon />
                    </button>
                    <button
                        onClick={() => onDelete(id)}
                        className={`text-red-600 hover:bg-red-50 ${ICON_BUTTON_CLASSES}`}
                        title="Delete Team"
                        disabled={saving || isInactive}
                    >
                        <DeleteIcon />
                    </button>
                </div>
            </div>

            <div className="flex-1 mt-3">
                {isDeliveryTeam ? (
                    <div>
                        <div className="flex divide-x divide-gray-200 border-t border-b border-gray-200 -mx-4 px-4">
                            <PairSlot
                                role="Primary Driver"
                                employee={primary_driver}
                                placeholder="+ Assign Driver"
                                onAssign={() => onEdit(team)}
                                disabled={saving || isInactive}
                                accentClasses="bg-blue-100 text-blue-700"
                            />
                            <PairSlot
                                role="Assistant Driver"
                                employee={assistant_driver}
                                placeholder="+ Assign Assistant"
                                onAssign={() => onEdit(team)}
                                disabled={saving || isInactive}
                                accentClasses="bg-purple-100 text-purple-700"
                            />
                        </div>
                        <div className="mt-3">
                            <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${truck ? 'bg-gray-100 text-gray-700' : 'bg-gray-50 text-gray-400 italic border border-dashed border-gray-200'}`}>
                                {truck ? `Truck: ${truck.plate_no || truck.id}` : 'Unassigned Vehicle'}
                            </span>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-medium text-gray-600 uppercase tracking-wider">
                                Members ({memberCount})
                            </h4>
                            {inactiveCount > 0 && (
                                <span className="text-xs text-gray-400">{inactiveCount} inactive</span>
                            )}
                        </div>

                        {members.length > 0 ? (
                            <div className="space-y-1.5">
                                {visibleMembers.map(member => (
                                    <div key={member.id} className="flex items-center justify-between gap-2 text-sm">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold ${member.active_flag ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                                                {getInitials(getMemberName(member))}
                                            </span>
                                            <span className={`truncate ${member.active_flag ? "text-gray-800" : "text-gray-400"}`}>
                                                {getMemberName(member)}
                                            </span>
                                        </div>
                                        <span className={`flex-shrink-0 text-xs px-2 py-1 rounded ${member.active_flag
                                                ? "bg-green-100 text-green-700"
                                                : "bg-gray-100 text-gray-500"
                                            }`}>
                                            {getMemberRole(member)}
                                        </span>
                                    </div>
                                ))}
                                {hiddenMemberCount > 0 && (
                                    <p className="text-xs text-gray-400 pl-8">+{hiddenMemberCount} more</p>
                                )}
                            </div>
                        ) : (
                            <p className="text-xs text-gray-400 italic">No members assigned</p>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default TeamCard;
