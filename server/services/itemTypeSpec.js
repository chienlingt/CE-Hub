// server/services/itemTypeSpec.js
//
// Pure rules for item types (Information > Item): validation, the API shape,
// and keyword matching that suggests a type for a product name. No Prisma, so
// it is unit-testable.
//
// Matching (decided 2026-11-21): a keyword is a set of words; it matches when
// every word appears as a word in the product name, in any order. The most
// specific match wins (most words, then the longest keyword). A tie between
// two types gives no suggestion. Inactive types are never suggested. A
// suggestion is only a suggestion: an admin accepts it before it counts.

const NAME_MAX = 80;
const MINUTES = { min: 0, max: 480 };
const POINTS = { min: 0, max: 100000 };
const KEYWORDS_MAX = 50;
const KEYWORD_MAX_LENGTH = 80;

const httpError = (status, code, message) => Object.assign(new Error(message), { status, code });
const round2 = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

/**
 * Lower-case, drop inch marks, turn punctuation into spaces and join a number
 * to its unit ("12 KG" -> "12kg", '65"' -> "65"), so names and keywords
 * compare word for word.
 */
function normalizeText(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/["“”″]/g, '')
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/(^|\s)\.+|\.+(?=\s|$)/g, ' ')
    .replace(/(\d)\s+(kg|l|hp|cm|mm|inch|in|w)\b/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

const words = text => (normalizeText(text) ? normalizeText(text).split(' ') : []);

/** Comma-separated string or list -> unique normalised keywords. */
function parseKeywords(raw) {
  const list = Array.isArray(raw) ? raw : String(raw ?? '').split(',');
  const out = [];
  for (const item of list) {
    const keyword = normalizeText(item);
    if (keyword && !out.includes(keyword)) out.push(keyword);
  }
  return out;
}

/** Best keyword score of one type against a name's words, or null. */
function typeScore(nameWords, keywords) {
  let best = null;
  for (const keyword of keywords || []) {
    const parts = words(keyword);
    if (!parts.length || !parts.every(part => nameWords.has(part))) continue;
    const score = [parts.length, parts.join(' ').length];
    if (!best || score[0] > best[0] || (score[0] === best[0] && score[1] > best[1])) best = score;
  }
  return best;
}

/**
 * The active type whose keywords match `name` most specifically, or null.
 * @param {string} name   product name
 * @param {Array<{id, keywords, active}>} types
 */
function matchItemType(name, types = []) {
  const nameWords = new Set(words(name));
  if (!nameWords.size) return null;
  let best = null;
  let tied = false;
  for (const type of types) {
    if (type.active === false) continue;
    const score = typeScore(nameWords, type.keywords);
    if (!score) continue;
    if (!best || score[0] > best.score[0] || (score[0] === best.score[0] && score[1] > best.score[1])) {
      best = { id: type.id, score };
      tied = false;
    } else if (score[0] === best.score[0] && score[1] === best.score[1]) {
      tied = true;
    }
  }
  return best && !tied ? best.id : null;
}

function minutesField(raw, label) {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'string' ? Number(raw.trim()) : raw;
  if (!Number.isInteger(n) || n < MINUTES.min || n > MINUTES.max) {
    throw httpError(400, 'INVALID_ITEM_TYPE', `${label} must be a whole number from ${MINUTES.min} to ${MINUTES.max}, or blank.`);
  }
  return n;
}

function pointsField(raw, label = 'Points per item') {
  const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < POINTS.min || n > POINTS.max) {
    throw httpError(400, 'INVALID_POINTS', `${label} must be a number from ${POINTS.min} to ${POINTS.max}.`);
  }
  return round2(n);
}

/**
 * Validate a create (full) or update (partial) body. Throws a 400 httpError.
 * @returns {object} only the fields given, normalised
 */
function itemTypeInput(input = {}, { partial = false } = {}) {
  const has = key => Object.prototype.hasOwnProperty.call(input ?? {}, key);
  const out = {};
  if (!partial || has('name')) {
    const name = typeof input.name === 'string' ? input.name.trim().replace(/\s+/g, ' ') : '';
    if (!name || name.length > NAME_MAX) throw httpError(400, 'INVALID_ITEM_TYPE', `Item type name is required (max ${NAME_MAX} characters).`);
    out.name = name;
  }
  if (!partial || has('install_minutes')) out.install_minutes = minutesField(input.install_minutes, 'Install time');
  if (!partial || has('dismantle_minutes')) out.dismantle_minutes = minutesField(input.dismantle_minutes, 'Dismantle time');
  if (!partial || has('requires_installer')) out.requires_installer = Boolean(input.requires_installer);
  if (!partial || has('default_points')) {
    out.default_points = input.default_points === undefined && !partial ? 0 : pointsField(input.default_points, 'Default points');
  }
  if (!partial || has('keywords')) {
    const keywords = parseKeywords(input.keywords);
    if (keywords.length > KEYWORDS_MAX) throw httpError(400, 'INVALID_ITEM_TYPE', `At most ${KEYWORDS_MAX} keywords.`);
    if (keywords.some(k => k.length > KEYWORD_MAX_LENGTH)) throw httpError(400, 'INVALID_ITEM_TYPE', `Each keyword is at most ${KEYWORD_MAX_LENGTH} characters.`);
    out.keywords = keywords;
  }
  if (has('active')) {
    if (typeof input.active !== 'boolean') throw httpError(400, 'INVALID_ITEM_TYPE', 'active must be true or false.');
    out.active = input.active;
  }
  return out;
}

/** Stored row -> API shape. */
function itemTypeRow(row, productCount = 0) {
  return {
    id: row.id,
    name: row.name,
    install_minutes: row.install_minutes ?? null,
    dismantle_minutes: row.dismantle_minutes ?? null,
    requires_installer: !!row.requires_installer,
    default_points: row.default_points ?? 0,
    keywords: Array.isArray(row.keywords) ? row.keywords : [],
    active: row.active !== false,
    product_count: productCount,
  };
}

module.exports = {
  NAME_MAX, MINUTES, POINTS,
  httpError, round2,
  normalizeText, parseKeywords, matchItemType,
  itemTypeInput, pointsField, minutesField, itemTypeRow,
};
