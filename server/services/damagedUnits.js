// server/services/damagedUnits.js
//
// FRD v1.2 INT-10 / §12 data point 21: a unit that was not delivered is either
// "undelivered" (it comes back intact) or "damaged" (it goes to the RMA flow once
// received). The driver classifies each unit in the partial-delivery and the
// failed-delivery flows, and every damaged unit needs at least one evidence photo.
//
// Photos are referenced by position in the request's uploaded files
// (`photo_indexes: [0, 2]`), so a unit points to its own photos.
//
// Pure: no database access.

const NOT_DELIVERED_OUTCOMES = ['undelivered', 'damaged'];
const DEFAULT_DAMAGE_REASON = 'Damaged';

const fail = (statusCode, code, message) => Object.assign(new Error(message), { statusCode, code });
const norm = serial => String(serial).trim().toLowerCase();

function outcomeOf(entry, lineId) {
  const outcome = entry?.outcome ?? 'undelivered';
  if (!NOT_DELIVERED_OUTCOMES.includes(outcome)) {
    throw fail(400, 'INVALID_OUTCOME', `Line ${lineId}: a unit outcome must be "undelivered" or "damaged".`);
  }
  return outcome;
}

/**
 * Evidence photo paths for one damaged unit.
 * @param {object} entry - request entry with photo_indexes
 * @param {string[]} photoPaths - stored paths of the request's uploaded photos, in upload order
 */
function damageEvidenceFor(entry, photoPaths, lineId, unitLabel) {
  const indexes = entry?.photo_indexes ?? [];
  if (!Array.isArray(indexes) || indexes.some(index => !Number.isInteger(index) || index < 0 || index >= photoPaths.length)) {
    throw fail(400, 'INVALID_PHOTO_INDEX', `Line ${lineId}: unit ${unitLabel} refers to a photo that was not uploaded.`);
  }
  const paths = [...new Set(indexes.map(index => photoPaths[index]))];
  if (!paths.length) {
    throw fail(400, 'DAMAGE_EVIDENCE_REQUIRED', `Line ${lineId}: damaged unit ${unitLabel} needs at least one photo.`);
  }
  return paths;
}

/** Position of the unit an entry names, by serial or 1-based unit_number; undefined if none. */
function unitPosition(entry, units) {
  if (entry?.serial_number != null) {
    const wanted = norm(entry.serial_number);
    const position = units.findIndex(unit => unit.assigned_serial && norm(unit.assigned_serial) === wanted);
    return position === -1 ? undefined : position;
  }
  const number = entry?.unit_number;
  return Number.isInteger(number) && number >= 1 && number <= units.length ? number - 1 : undefined;
}

function unitLabel(units, position) {
  return units[position]?.assigned_serial || `#${position + 1}`;
}

/** A unit with its final not-delivered outcome; drops any stale outcome fields first. */
function withOutcome(unit, { outcome, reason, evidence }) {
  const { undelivered_reason: _r, damage_evidence: _e, delivery_outcome: _o, ...rest } = unit;
  return {
    ...rest,
    delivery_outcome: outcome,
    ...(reason ? { undelivered_reason: reason } : {}),
    ...(outcome === 'damaged' ? { damage_evidence: evidence } : {}),
  };
}

/**
 * Failed delivery: every unit of a line is undelivered unless the driver lists it
 * as damaged. `entries` is the line's optional `units` list:
 * [{ serial_number? | unit_number?, outcome: 'undelivered'|'damaged', reason?, photo_indexes? }]
 *
 * @returns {Array} the line's units with delivery_outcome set
 */
function classifyFailedLine(units, entries, photoPaths, lineId) {
  if (entries == null) entries = [];
  if (!Array.isArray(entries)) throw fail(400, 'INVALID_ITEMS', `Line ${lineId}: units must be a list.`);
  const classified = new Map();
  for (const entry of entries) {
    const position = unitPosition(entry, units);
    if (position === undefined) throw fail(400, 'INVALID_ITEMS', `Line ${lineId}: a unit outcome names a unit that is not on this line.`);
    if (classified.has(position)) throw fail(400, 'INVALID_ITEMS', `Line ${lineId}: unit ${unitLabel(units, position)} appears more than once.`);
    const outcome = outcomeOf(entry, lineId);
    const reason = typeof entry.reason === 'string' && entry.reason.trim() ? entry.reason.trim().slice(0, 200) : null;
    classified.set(position, {
      outcome,
      reason: reason || (outcome === 'damaged' ? DEFAULT_DAMAGE_REASON : null),
      evidence: outcome === 'damaged' ? damageEvidenceFor(entry, photoPaths, lineId, unitLabel(units, position)) : [],
    });
  }
  return units.map((unit, position) => withOutcome(unit, classified.get(position) || { outcome: 'undelivered' }));
}

module.exports = {
  NOT_DELIVERED_OUTCOMES,
  DEFAULT_DAMAGE_REASON,
  outcomeOf,
  damageEvidenceFor,
  unitPosition,
  unitLabel,
  withOutcome,
  classifyFailedLine,
};
