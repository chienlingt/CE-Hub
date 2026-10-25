import { resolveDataSource } from '../dataSource';

const params = (qs) => new URLSearchParams(qs);

describe('resolveDataSource', () => {
  const ORIGINAL = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  function setEnv(overrides) {
    process.env = { ...ORIGINAL, ...overrides };
  }

  describe('precedence', () => {
    it('defaults to live when nothing is configured', () => {
      setEnv({ REACT_APP_SCHEDULE_DATA_SOURCE: undefined, REACT_APP_DEMO_AUTH: undefined });
      expect(resolveDataSource(params(''))).toEqual({
        source: 'live', requested: null, blocked: false,
      });
    });

    it('uses the env var when the URL says nothing', () => {
      setEnv({ REACT_APP_SCHEDULE_DATA_SOURCE: 'mock' });
      expect(resolveDataSource(params('')).source).toBe('mock');
    });

    it('lets ?data= override the env var in both directions', () => {
      setEnv({ REACT_APP_SCHEDULE_DATA_SOURCE: 'mock' });
      expect(resolveDataSource(params('data=live')).source).toBe('live');

      setEnv({ REACT_APP_SCHEDULE_DATA_SOURCE: 'live' });
      expect(resolveDataSource(params('data=mock')).source).toBe('mock');
    });

    it('ignores an unrecognised ?data= value rather than trusting it', () => {
      setEnv({ REACT_APP_SCHEDULE_DATA_SOURCE: 'mock' });
      const result = resolveDataSource(params('data=prod'));
      expect(result.source).toBe('mock');
      expect(result.requested).toBeNull();
    });

    it('ignores an unrecognised env value and falls back to live', () => {
      setEnv({ REACT_APP_SCHEDULE_DATA_SOURCE: 'banana' });
      expect(resolveDataSource(params('')).source).toBe('live');
    });

    it('tolerates a missing searchParams', () => {
      setEnv({ REACT_APP_SCHEDULE_DATA_SOURCE: 'mock' });
      expect(resolveDataSource(null).source).toBe('mock');
      expect(resolveDataSource(undefined).source).toBe('mock');
    });
  });

  // The guard that matters: client/.env.production is committed and points
  // REACT_APP_API_BASE_URL at production, so a demo build must never read live.
  describe('demo-build safety gate', () => {
    it('refuses ?data=live in a demo build and reports that it blocked', () => {
      setEnv({ REACT_APP_DEMO_AUTH: '1', REACT_APP_SCHEDULE_DATA_SOURCE: 'mock' });
      expect(resolveDataSource(params('data=live'))).toEqual({
        source: 'mock', requested: 'live', blocked: true,
      });
    });

    it('refuses live even when the env var itself asks for it', () => {
      setEnv({ REACT_APP_DEMO_AUTH: '1', REACT_APP_SCHEDULE_DATA_SOURCE: 'live' });
      const result = resolveDataSource(params(''));
      expect(result.source).toBe('mock');
      expect(result.blocked).toBe(true);
    });

    it('allows live in a demo build only with the explicit override', () => {
      setEnv({
        REACT_APP_DEMO_AUTH: '1',
        REACT_APP_ALLOW_LIVE_IN_DEMO: '1',
        REACT_APP_SCHEDULE_DATA_SOURCE: 'mock',
      });
      expect(resolveDataSource(params('data=live'))).toEqual({
        source: 'live', requested: 'live', blocked: false,
      });
    });

    it('does not gate live when demo auth is off', () => {
      setEnv({ REACT_APP_DEMO_AUTH: undefined });
      expect(resolveDataSource(params('data=live'))).toEqual({
        source: 'live', requested: 'live', blocked: false,
      });
    });

    it('treats any value other than "1" as demo auth off', () => {
      setEnv({ REACT_APP_DEMO_AUTH: 'true' });
      expect(resolveDataSource(params('data=live')).blocked).toBe(false);
    });

    it('never blocks when mock was what was wanted anyway', () => {
      setEnv({ REACT_APP_DEMO_AUTH: '1' });
      expect(resolveDataSource(params('data=mock'))).toEqual({
        source: 'mock', requested: 'mock', blocked: false,
      });
    });
  });
});
