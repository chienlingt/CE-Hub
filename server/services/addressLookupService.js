// server/services/addressLookupService.js
//
// Address lookup for B.1 Find a slot only. B.2 keeps using routeGeocodeCache.
// No Places API: the project's key only has Geocoding enabled.
//
//   suggestAddresses()  type-ahead from CE Hub's own data: buildings, then past
//                       delivery addresses (with coords when B.2 already cached them)
//   geocodeCandidates() "Check address": Google Geocoding matches, each flagged
//                       precise or not, for the user to confirm
//   geocodeStrict()     typed address sent without a check: first precise match
//                       or NOT_FOUND. Google answers "OK" with a vague guess for
//                       typos, so partial/approximate/town-only results are refused.
//
// Nothing is written: no geocode cache entries are created here.

const axios = require('axios');
const prisma = require('../prismaClient');
const { readCachedAddress, normalizeAddress, validCoords } = require('./routeGeocodeCache');
const { getOrderAddress } = require('./googleRoutingService');

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const TIMEOUT_MS = 8000;
const MAX_SUGGESTIONS = 8;
const MAX_CANDIDATES = 3;
const PRECISE_LOCATION_TYPES = ['ROOFTOP', 'RANGE_INTERPOLATED', 'GEOMETRIC_CENTER'];
const VAGUE_TYPES = ['country', 'administrative_area_level_1', 'administrative_area_level_2', 'locality', 'postal_code', 'political'];

class AddressLookupError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

const coordsOf = (row) => {
  const c = { lat: Number(row?.latitude), lon: Number(row?.longitude) };
  return row && row.latitude != null && row.longitude != null && validCoords(c) ? c : null;
};

// ------------------------------------------------------------------ type-ahead

/**
 * Up to 8 suggestions for `q`: buildings (name, address or postcode match) first,
 * then distinct past delivery addresses.
 * @returns {Promise<Array<{key, kind: 'building'|'past', text, main_text, secondary_text, building_id?, location?}>>}
 */
async function suggestAddresses(q, { db = prisma } = {}) {
  const term = q.trim();
  const contains = { contains: term, mode: 'insensitive' };

  const buildings = await db.buildings.findMany({
    where: { OR: [{ building_name: contains }, { address: contains }, { postal_code: { startsWith: term } }] },
    select: { id: true, building_name: true, address: true, postal_code: true, latitude: true, longitude: true },
    orderBy: { building_name: 'asc' },
    take: MAX_SUGGESTIONS,
  });
  const out = buildings
    .filter(b => b.building_name || b.address)
    .map(b => {
      const coords = coordsOf(b);
      return {
        key: `building:${b.id}`,
        kind: 'building',
        text: [b.building_name, b.address].filter(Boolean).join(', '),
        main_text: b.building_name || b.address,
        secondary_text: b.building_name ? (b.address || b.postal_code || '') : (b.postal_code || ''),
        building_id: b.id,
        location: coords ? { ...coords, label: b.address || b.building_name } : null,
      };
    });
  if (out.length >= MAX_SUGGESTIONS) return out;

  const orders = await db.orders.findMany({
    where: { OR: [{ delivery_address: contains }, { remarks_delivery_address: contains }, { delivery_postcode: { startsWith: term } }] },
    select: {
      delivery_address: true, remarks_delivery_address: true, original_delivery_address: true,
      delivery_city: true, delivery_postcode: true, delivery_state: true, building_id: true,
      buildings: { select: { address: true, latitude: true, longitude: true, postal_code: true, building_name: true } },
    },
    orderBy: { created_at: 'desc' },
    take: 40,
  });
  const seen = new Set(out.map(s => normalizeAddress(s.text)));
  const shownBuildings = new Set(out.map(s => s.building_id));
  for (const o of orders) {
    if (out.length >= MAX_SUGGESTIONS) break;
    if (o.building_id && shownBuildings.has(o.building_id)) continue;
    const full = getOrderAddress(o);
    const key = normalizeAddress(full);
    if (!key || full === 'UNKNOWN' || seen.has(key)) continue;
    seen.add(key);
    // Coordinates only if B.2 already geocoded this exact address; else the user checks it.
    const coords = await readCachedAddress(full).catch(() => null);
    const street = o.remarks_delivery_address || o.delivery_address || full;
    out.push({
      key: `past:${key}`,
      kind: 'past',
      text: full,
      main_text: street,
      secondary_text: [o.delivery_postcode, o.delivery_city].filter(Boolean).join(' '),
      location: coords ? { ...coords, label: full } : null,
    });
  }
  return out;
}

// ------------------------------------------------------------------ Google Geocoding

/**
 * Does this Geocoding result point at a specific spot (building, street), not
 * just a town, state or country? Pure. A partial match (Google corrected a typo)
 * can still be specific: the user confirms it via "Check address".
 */
function isSpecificGeocode(result) {
  if (!result) return false;
  if (!PRECISE_LOCATION_TYPES.includes(result.geometry?.location_type)) return false;
  const types = result.types ?? [];
  return !types.length || !types.every(t => VAGUE_TYPES.includes(t));
}

/** Specific AND an exact match: safe to use without asking the user. Pure. */
function isPreciseGeocode(result) {
  return isSpecificGeocode(result) && !result.partial_match;
}

function apiKey() {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) throw new AddressLookupError('Address lookup is not configured (no Google key).', 'NO_KEY');
  return key;
}

/**
 * Google's matches for a typed address, Malaysia only, each flagged precise.
 * @returns {Promise<Array<{formatted_address, lat, lon, precise, confirmable}>>} empty when Google finds nothing
 */
async function geocodeCandidates(address) {
  const key = apiKey();
  let data;
  try {
    ({ data } = await axios.get(GEOCODE_URL, { params: { address, region: 'my', components: 'country:MY', key }, timeout: TIMEOUT_MS }));
  } catch (err) {
    throw new AddressLookupError(`Address lookup failed (${err.response?.data?.error_message || err.message}).`, 'GOOGLE_ERROR');
  }
  if (data?.status === 'ZERO_RESULTS') return [];
  if (data?.status !== 'OK') {
    throw new AddressLookupError(`Address lookup failed (${data?.status}${data?.error_message ? `: ${data.error_message}` : ''}).`, 'GOOGLE_ERROR');
  }
  return (data.results ?? [])
    .filter(r => validCoords({ lat: r.geometry?.location?.lat, lon: r.geometry?.location?.lng }))
    .slice(0, MAX_CANDIDATES)
    .map(r => ({
      formatted_address: r.formatted_address ?? null,
      lat: r.geometry.location.lat,
      lon: r.geometry.location.lng,
      precise: isPreciseGeocode(r),
      // Specific enough for the user to confirm, even if Google corrected a typo.
      confirmable: isSpecificGeocode(r),
    }));
}

/**
 * Typed address sent without checking it first.
 * @returns {Promise<{coords, formatted_address}>}
 * @throws AddressLookupError NOT_FOUND when Google has no precise match
 */
async function geocodeStrict(address) {
  const candidates = await geocodeCandidates(address);
  const best = candidates.find(c => c.precise);
  if (best) return { coords: { lat: best.lat, lon: best.lon }, formatted_address: best.formatted_address };
  if (!candidates.length) throw new AddressLookupError('Google could not find this address.', 'NOT_FOUND');
  throw new AddressLookupError(
    `Google only found an approximate match (“${candidates[0].formatted_address}”).`,
    'NOT_FOUND',
  );
}

module.exports = {
  AddressLookupError, suggestAddresses, geocodeCandidates, geocodeStrict, isPreciseGeocode, isSpecificGeocode,
};
