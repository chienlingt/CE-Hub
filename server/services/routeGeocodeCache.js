const crypto = require('crypto');
const axios = require('axios');
const prisma = require('../prismaClient');
const TTL_MS = 28 * 86400000;
const inFlight = new Map();
const normalizeAddress = address => String(address || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const addressKey = address => crypto.createHash('sha256').update(normalizeAddress(address)).digest('hex');
function validCoords(point) {
  return point && point.lat != null && point.lon != null && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lon)) && Math.abs(Number(point.lat)) <= 90 && Math.abs(Number(point.lon)) <= 180;
}
async function queueAddress(address, db = prisma) {
  if (!normalizeAddress(address) || address === 'UNKNOWN') return;
  await db.route_geocode_cache.upsert({ where: { address_key: addressKey(address) }, update: {}, create: { address_key: addressKey(address), address } });
}
async function readCachedAddress(address) {
  const row = await prisma.route_geocode_cache.findUnique({ where: { address_key: addressKey(address) } });
  if (!row || !row.expires_at || new Date(row.expires_at).getTime() <= Date.now()) return null;
  const coords = { lat: row.latitude, lon: row.longitude };
  return validCoords(coords) ? coords : null;
}
async function geocodeCachedAddress(address) {
  if (!normalizeAddress(address) || address === 'UNKNOWN') throw new Error('Delivery address is missing');
  const key = addressKey(address);
  if (inFlight.has(key)) return inFlight.get(key);
  const work = (async () => {
    const cached = await readCachedAddress(address);
    if (cached) return cached;
    if (!process.env.GOOGLE_MAPS_SERVER_KEY) throw new Error('GOOGLE_MAPS_SERVER_KEY not configured');
    const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: { address: `${address}, Malaysia`, key: process.env.GOOGLE_MAPS_SERVER_KEY }, timeout: 5000,
    });
    const location = response.data?.status === 'OK' && response.data.results?.[0]?.geometry?.location;
    const coords = location && { lat: location.lat, lon: location.lng };
    if (!validCoords(coords)) throw new Error(`Geocoding unavailable (${response.data?.status || 'INVALID_LOCATION'})`);
    const expires = new Date(Date.now() + TTL_MS);
    await prisma.route_geocode_cache.upsert({ where: { address_key: key },
      create: { address_key: key, address, latitude: coords.lat, longitude: coords.lon, expires_at: expires, next_retry_at: expires },
      update: { latitude: coords.lat, longitude: coords.lon, expires_at: expires, next_retry_at: expires, attempts: 0, last_error: null },
    });
    return coords;
  })();
  inFlight.set(key, work);
  try { return await work; } finally { inFlight.delete(key); }
}
let running = false;
async function processGeocodeQueue() {
  if (running) return;
  running = true;
  try {
    // Expired Google coordinates must not remain as a permanent cache.
    await prisma.route_geocode_cache.updateMany({ where: { expires_at: { lte: new Date() } }, data: { latitude: null, longitude: null, expires_at: null } });
    const rows = await prisma.route_geocode_cache.findMany({ where: { next_retry_at: { lte: new Date() }, attempts: { lt: 5 } }, orderBy: { next_retry_at: 'asc' }, take: 10 });
    for (const row of rows) {
      const claimed = await prisma.route_geocode_cache.updateMany({ where: { address_key: row.address_key, next_retry_at: row.next_retry_at }, data: { next_retry_at: new Date(Date.now() + 120000) } });
      if (!claimed.count) continue;
      try { await geocodeCachedAddress(row.address); }
      catch (error) {
        await prisma.route_geocode_cache.update({ where: { address_key: row.address_key }, data: {
          attempts: { increment: 1 }, last_error: error.message, next_retry_at: new Date(Date.now() + 5 * 60000),
        } });
      }
    }
  } finally { running = false; }
}
module.exports = { queueAddress, readCachedAddress, geocodeCachedAddress, processGeocodeQueue, normalizeAddress, validCoords };
