import type { NetMessage } from './protocol';

export type Role = 'host' | 'guest';

/**
 * Transport-level lifecycle, independent of the game protocol:
 * - `registering`: talking to the signaling broker to get / claim an id
 * - `waiting`: host is registered and listening for a guest
 * - `dialing`: guest is connecting to the host's id
 * - `channel-open` / `channel-closed`: the direct data channel came up / went away
 * - `broker-lost`: signaling connection dropped (the game channel may still be fine)
 */
export type LinkStatus =
  'registering' | 'waiting' | 'dialing' | 'channel-open' | 'channel-closed' | 'broker-lost';

export type LinkErrorKind =
  'room-taken' | 'room-not-found' | 'room-full' | 'network' | 'webrtc' | 'unsupported' | 'unknown';

export type LinkError = { kind: LinkErrorKind; message: string };

export type LinkEvents = {
  onStatus: (status: LinkStatus) => void;
  onMessage: (msg: NetMessage) => void;
  onError: (error: LinkError) => void;
};

export interface Link {
  readonly role: Role;
  readonly code: string;
  /** Queues a message on the open channel. Returns false if the channel is not open. */
  send(msg: NetMessage): boolean;
  /** Guest only: dial the host again after the channel dropped. No-op for the host. */
  redial(): void;
  close(): void;
}

export type LinkFactory = (role: Role, code: string, events: LinkEvents) => Promise<Link>;
