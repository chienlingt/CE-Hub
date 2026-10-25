// Resolves where the scheduler UI reads its data from. This is the only place
// that decision is made, so the mock/live seam has exactly one gate.
//
// Precedence: ?data= in the URL  >  REACT_APP_SCHEDULE_DATA_SOURCE  >  'live'.
//
// Safety gate: a demo build (REACT_APP_DEMO_AUTH=1) refuses 'live'. CRA loads
// client/.env.production for every production build, and that committed file
// points REACT_APP_API_BASE_URL at https://lab2.tbm2u.net — so without this
// gate, typing ?data=live into a demo URL would read and write PRODUCTION,
// against an API that has no server-side auth. Set
// REACT_APP_ALLOW_LIVE_IN_DEMO=1 to override deliberately.

export const DATA_SOURCES = ['mock', 'live'];

// Read inside the functions, not at module scope, so this stays unit-testable.
// CRA inlines process.env.REACT_APP_* at build time either way, so there is no
// runtime cost to reading them per call.
const isDemoAuth = () => process.env.REACT_APP_DEMO_AUTH === '1';
const allowsLiveInDemo = () => process.env.REACT_APP_ALLOW_LIVE_IN_DEMO === '1';

/**
 * @param {URLSearchParams|null} searchParams
 * @returns {{source: 'mock'|'live', requested: string|null, blocked: boolean}}
 *   `blocked` is true when 'live' was asked for but the demo gate refused it,
 *   so the UI can say so rather than silently showing the wrong data.
 */
export function resolveDataSource(searchParams) {
  const fromUrl = searchParams?.get('data') ?? null;
  const requested = DATA_SOURCES.includes(fromUrl) ? fromUrl : null;

  const configured = DATA_SOURCES.includes(process.env.REACT_APP_SCHEDULE_DATA_SOURCE)
    ? process.env.REACT_APP_SCHEDULE_DATA_SOURCE
    : 'live';

  const wanted = requested ?? configured;

  if (wanted === 'live' && isDemoAuth() && !allowsLiveInDemo()) {
    return { source: 'mock', requested: wanted, blocked: true };
  }

  return { source: wanted, requested, blocked: false };
}

export default resolveDataSource;
