import { describe, expect, it } from 'vitest';
import { hasTurnRelay, iceServers } from './ice';

describe('iceServers', () => {
  it('always offers public STUN and no relay by default', () => {
    const servers = iceServers({});
    expect(servers).toHaveLength(1);
    expect(servers[0].urls).toEqual(
      expect.arrayContaining(['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478']),
    );
    expect(hasTurnRelay({})).toBe(false);
  });

  it('adds a TURN relay from the environment', () => {
    const env = {
      VITE_TURN_URLS: ' turn:relay.example.com:80, turns:relay.example.com:443?transport=tcp ,junk',
      VITE_TURN_USERNAME: 'user',
      VITE_TURN_CREDENTIAL: 'secret',
    };
    const servers = iceServers(env);
    expect(servers).toHaveLength(2);
    expect(servers[1]).toEqual({
      urls: ['turn:relay.example.com:80', 'turns:relay.example.com:443?transport=tcp'],
      username: 'user',
      credential: 'secret',
    });
    expect(hasTurnRelay(env)).toBe(true);
  });

  it('ignores an empty or malformed TURN setting', () => {
    expect(iceServers({ VITE_TURN_URLS: '' })).toHaveLength(1);
    expect(iceServers({ VITE_TURN_URLS: 'https://not-a-turn-url' })).toHaveLength(1);
  });
});
