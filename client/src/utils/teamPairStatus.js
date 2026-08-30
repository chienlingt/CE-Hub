// Derives the Ready / Incomplete / Empty completeness indicator for a Delivery team's
// Primary Driver + Assistant Driver + Truck pairing. This is intentionally separate from
// the team's Active/Inactive (`available_flag`) status — a team can be Active but still
// Incomplete (e.g. missing an assistant), or Inactive with an Empty pair.

export function getTeamPairStatus(team) {
    const hasPrimary = !!team?.primary_driver_id;
    const hasAssistant = !!team?.assistant_driver_id;
    const hasTruck = !!team?.truck_id;

    if (hasPrimary && hasAssistant && hasTruck) return 'ready';
    if (!hasPrimary && !hasAssistant && !hasTruck) return 'empty';
    return 'incomplete';
}

export function getTeamPairStatusStyle(status) {
    switch (status) {
        case 'ready':
            return 'bg-green-500';
        case 'incomplete':
            return 'bg-amber-500';
        default:
            return 'bg-gray-300';
    }
}

export function getTeamPairStatusLabel(status) {
    switch (status) {
        case 'ready':
            return 'Ready';
        case 'incomplete':
            return 'Incomplete';
        default:
            return 'Empty';
    }
}
