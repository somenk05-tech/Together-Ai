import { buildIceConfig, hasRelay, parseIceServers, PUBLIC_STUN } from './ice-config';

/**
 * A call that rings and then sits in silence is almost always this file.
 * The assertions worth having are the failure ones: bad config must degrade,
 * and a missing relay must be *said*, not discovered by a citizen on office wifi.
 */
describe('ICE configuration', () => {
  it('always gives the peers a STUN server, even with nothing configured', () => {
    const cfg = buildIceConfig({});
    expect(cfg.iceServers[0].urls).toContain(PUBLIC_STUN);
  });

  it('admits when there is no relay, in words a frontend can show', () => {
    const cfg = buildIceConfig({});
    expect(cfg.relayAvailable).toBe(false);
    expect(cfg.note).toMatch(/TURN/);
  });

  it('reports a relay once TURN is configured, with its credentials', () => {
    const cfg = buildIceConfig({
      TURN_URL: 'turn:turn.togethercity.app:3478',
      TURN_USERNAME: 'city',
      TURN_CREDENTIAL: 'secret',
    });
    expect(cfg.relayAvailable).toBe(true);
    expect(cfg.note).toBeNull();
    expect(cfg.iceServers.some((s) => s.username === 'city' && s.credential === 'secret')).toBe(true);
  });

  it('survives malformed JSON rather than taking the API down at boot', () => {
    const { servers, problems } = parseIceServers({ ICE_SERVERS: '{not json' });
    expect(servers).toEqual([]);
    expect(problems[0]).toMatch(/not valid JSON/);
  });

  it('drops URLs that are not stun/turn, so a typo cannot become an outbound fetch', () => {
    const { servers } = parseIceServers({
      ICE_SERVERS: JSON.stringify([{ urls: ['https://example.com/evil', 'stun:a.example:3478'] }]),
    });
    expect(servers).toEqual([{ urls: ['stun:a.example:3478'] }]);
  });

  it('accepts a single string url as well as a list, matching RTCIceServer', () => {
    const { servers } = parseIceServers({
      ICE_SERVERS: JSON.stringify([{ urls: 'turns:a.example:5349', username: 'city', credential: 'secret' }]),
    });
    expect(servers[0].urls).toEqual(['turns:a.example:5349']);
    expect(hasRelay(servers)).toBe(true);
  });

  /* A URL IS NOT A RELAY. hasRelay read the scheme and nothing else, so a TURN
     entry with no credentials — the shape a half-finished deployment leaves
     behind — reported relayAvailable: true, which silenced the one note this
     file exists to raise. The call still rang, connected and sat in silence;
     the difference is that nobody was told why. */
  it('does not count a TURN server nobody can authenticate to, and says so', () => {
    const fromJson = parseIceServers({ ICE_SERVERS: JSON.stringify([{ urls: 'turn:a.example:3478' }]) });
    expect(hasRelay(fromJson.servers)).toBe(false);
    expect(fromJson.problems.join(' ')).toMatch(/username and credential/);

    const fromEnv = parseIceServers({ TURN_URL: 'turn:a.example:3478', TURN_USERNAME: 'city' });
    expect(hasRelay(fromEnv.servers)).toBe(false);
    expect(fromEnv.problems.join(' ')).toMatch(/credential/);

    // And the whole config says it in words a frontend can show.
    expect(buildIceConfig({ TURN_URL: 'turn:a.example:3478' }).relayAvailable).toBe(false);
  });

  it('ignores a TURN_URL that is not a turn: URL and says so', () => {
    const { servers, problems } = parseIceServers({ TURN_URL: 'turn.example.com:3478' });
    expect(servers).toEqual([]);
    expect(problems[0]).toMatch(/TURN_URL/);
  });
});
