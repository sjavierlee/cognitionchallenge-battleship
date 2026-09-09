/** Public STUN servers used to discover each browser's public address. */
const STUN_URLS = ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'];

type IceEnv = Record<string, string | boolean | undefined>;

function str(v: string | boolean | undefined): string {
  return typeof v === 'string' ? v : '';
}

/**
 * ICE servers for the WebRTC connection: public STUN, plus a TURN relay when the build
 * provides one (`VITE_TURN_URLS`, comma-separated, with `VITE_TURN_USERNAME` /
 * `VITE_TURN_CREDENTIAL`). Without a relay, peers behind symmetric NATs (most mobile
 * carriers, many home routers) cannot reach each other.
 */
export function iceServers(env: IceEnv = import.meta.env): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: STUN_URLS }];
  const urls = str(env.VITE_TURN_URLS)
    .split(',')
    .map((u) => u.trim())
    .filter((u) => /^turns?:/i.test(u));
  if (urls.length > 0) {
    servers.push({
      urls,
      username: str(env.VITE_TURN_USERNAME),
      credential: str(env.VITE_TURN_CREDENTIAL),
    });
  }
  return servers;
}

export function hasTurnRelay(env: IceEnv = import.meta.env): boolean {
  return iceServers(env).length > 1;
}
