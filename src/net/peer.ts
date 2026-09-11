import type { DataConnection, Peer, PeerError, PeerErrorType, PeerOptions } from 'peerjs';
import { iceServers } from './ice';
import type { Link, LinkError, LinkErrorKind, LinkEvents, Role } from './link';
import { decode, type NetMessage } from './protocol';
import { peerIdForRoom } from './roomCode';

/**
 * Broker settings (unset means the public PeerJS cloud, `0.peerjs.com`) and our own ICE servers.
 * PeerJS's built-in `config` is replaced rather than merged: its default TURN hosts
 * (`*.turn.peerjs.com`) no longer resolve, so it effectively ships with STUN only.
 */
function peerOptions(): PeerOptions {
  const options: PeerOptions = { config: { iceServers: iceServers() } };
  const host = import.meta.env.VITE_PEER_HOST as string | undefined;
  if (!host) return options;
  return {
    ...options,
    host,
    port: Number(import.meta.env.VITE_PEER_PORT ?? 443),
    path: (import.meta.env.VITE_PEER_PATH as string | undefined) ?? '/',
    secure: import.meta.env.VITE_PEER_SECURE !== 'false',
  };
}

function classify(err: PeerError<`${PeerErrorType}`>): LinkError {
  const map: Partial<Record<`${PeerErrorType}`, LinkErrorKind>> = {
    'unavailable-id': 'room-taken',
    'peer-unavailable': 'room-not-found',
    'browser-incompatible': 'unsupported',
    network: 'network',
    'socket-error': 'network',
    'socket-closed': 'network',
    'server-error': 'network',
    webrtc: 'webrtc',
  };
  return { kind: map[err.type] ?? 'unknown', message: err.message };
}

const BROKER_RETRY_MS = 2000;
/** Data-channel liveness probe: a silent peer is declared gone after `HEARTBEAT_TIMEOUT_MS`. */
export const HEARTBEAT_MS = 2000;
export const HEARTBEAT_TIMEOUT_MS = 7000;

/** Link-level chatter that never reaches the game protocol. */
type Control = { t: 'ping' } | { t: 'busy' };
const PING: Control = { t: 'ping' };
/** Host's reply to a third browser knocking while the room already has two players. */
const BUSY: Control = { t: 'busy' };
const BUSY_CLOSE_MS = 2000;

function control(data: unknown): Control['t'] | null {
  if (typeof data !== 'object' || data === null) return null;
  const t = (data as { t?: unknown }).t;
  return t === 'ping' || t === 'busy' ? t : null;
}

/** Opens a PeerJS link. Loads the library lazily so AI-only visitors never download it. */
export async function openPeerLink(role: Role, code: string, events: LinkEvents): Promise<Link> {
  const { Peer } = await import('peerjs');
  const hostId = peerIdForRoom(code);
  const options = peerOptions();
  const peer: Peer = role === 'host' ? new Peer(hostId, options) : new Peer(options);

  let conn: DataConnection | null = null;
  let closed = false;
  let retryTimer: number | undefined;
  let heartbeat: number | undefined;

  const stopHeartbeat = () => {
    window.clearInterval(heartbeat);
    heartbeat = undefined;
  };

  const dropped = (c: DataConnection) => {
    if (conn !== c || closed) return;
    stopHeartbeat();
    conn = null;
    events.onStatus('channel-closed');
  };

  // Browsers can take a long time (or forever, on a LAN) to notice a peer whose tab simply
  // vanished, so both ends ping and give up on a silent channel themselves.
  const startHeartbeat = (c: DataConnection) => {
    stopHeartbeat();
    let lastSeen = Date.now();
    c.on('data', () => {
      lastSeen = Date.now();
    });
    heartbeat = window.setInterval(() => {
      if (conn !== c || !c.open) return stopHeartbeat();
      if (Date.now() - lastSeen > HEARTBEAT_TIMEOUT_MS) {
        dropped(c);
        c.close();
        return;
      }
      void c.send(PING);
    }, HEARTBEAT_MS);
  };

  const attach = (c: DataConnection) => {
    if (conn && conn !== c) conn.close();
    conn = c;
    c.on('open', () => {
      if (conn !== c) return;
      startHeartbeat(c);
      events.onStatus('channel-open');
    });
    c.on('data', (data: unknown) => {
      if (conn !== c) return;
      const kind = control(data);
      if (kind === 'ping') return;
      if (kind === 'busy') {
        events.onError({ kind: 'room-full', message: 'Room is full' });
        c.close();
        return;
      }
      const msg = decode(data);
      if (msg) events.onMessage(msg);
    });
    c.on('close', () => dropped(c));
    c.on('error', (err) => {
      if (conn === c) events.onError({ kind: 'webrtc', message: err.message });
    });
  };

  // The room seats two; anyone else is told so and shown the door.
  const turnAway = (c: DataConnection) => {
    c.on('open', () => {
      void c.send(BUSY);
      window.setTimeout(() => c.close(), BUSY_CLOSE_MS);
    });
  };

  const dial = () => {
    if (closed || peer.destroyed || peer.disconnected) return;
    events.onStatus('dialing');
    attach(peer.connect(hostId, { reliable: true, serialization: 'json' }));
  };

  events.onStatus('registering');

  // Fires again after every broker reconnect; an established channel does not need the broker.
  peer.on('open', () => {
    if (role === 'host') events.onStatus('waiting');
    else if (!conn?.open) dial();
  });
  peer.on('connection', (c) => {
    if (role !== 'host') c.close();
    else if (conn?.open) turnAway(c);
    else attach(c);
  });
  peer.on('disconnected', () => {
    if (closed) return;
    events.onStatus('broker-lost');
    window.clearTimeout(retryTimer);
    retryTimer = window.setTimeout(() => {
      if (!closed && !peer.destroyed && peer.disconnected) peer.reconnect();
    }, BROKER_RETRY_MS);
  });
  peer.on('error', (err) => {
    if (!closed) events.onError(classify(err));
  });

  return {
    role,
    code,
    send(msg: NetMessage): boolean {
      if (!conn || !conn.open) return false;
      void conn.send(msg);
      return true;
    },
    redial() {
      if (role !== 'guest' || conn?.open) return;
      if (peer.disconnected) peer.reconnect();
      else dial();
    },
    close() {
      closed = true;
      window.clearTimeout(retryTimer);
      stopHeartbeat();
      conn?.close();
      peer.destroy();
    },
  };
}
