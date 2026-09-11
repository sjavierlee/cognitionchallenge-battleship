import { act } from '@testing-library/react';
import { defaultRng, seededRng } from '../engine/rng';
import type { Link, LinkErrorKind, LinkEvents, LinkFactory, Role } from '../net/link';
import { appReducer, initialAppState, type AppAction, type AppState } from '../ui/appState';

/**
 * A transport whose far end is a second `appReducer` playing the opposite role, so the UI under
 * test talks to a real (headless) opponent without any network.
 */
export function fakeLink(peerName: string, now: () => number = Date.now) {
  let peer: AppState | null = null;
  let events: LinkEvents | null = null;
  let open = false;
  const calls: { role: Role; code: string }[] = [];

  const flushPeer = () => {
    if (!peer?.net || !events || !open) return;
    const out = peer.net.outbox;
    peer = appReducer(peer, { type: 'outbox-sent', count: out.length });
    for (const msg of out) events.onMessage(msg);
  };

  const factory: LinkFactory = async (role, code, ev) => {
    calls.push({ role, code });
    events = ev;
    const peerRole = role === 'host' ? 'join-room' : 'host-room';
    peer = appReducer(initialAppState(), {
      type: peerRole,
      code,
      name: peerName,
      session: `${peerName}-session`,
    });
    const link: Link = {
      role,
      code,
      send: (msg) => {
        if (!open || !peer) return false;
        peer = appReducer(peer, { type: 'peer-message', msg }, defaultRng, now);
        flushPeer();
        return true;
      },
      redial: () => {},
      close: () => {
        open = false;
      },
    };
    return link;
  };

  return {
    factory,
    calls,
    get peer() {
      if (!peer) throw new Error('peer not created');
      return peer;
    },
    /** Bring the channel up (both ends say hello). */
    connect() {
      act(() => {
        open = true;
        events?.onStatus('waiting');
        events?.onStatus('channel-open');
        if (peer) {
          peer = appReducer(peer, { type: 'link-status', status: 'channel-open' }, defaultRng, now);
        }
        flushPeer();
      });
    },
    disconnect() {
      act(() => {
        open = false;
        events?.onStatus('channel-closed');
      });
    },
    fail(kind: LinkErrorKind) {
      act(() => events?.onError({ kind, message: kind }));
    },
    /** Drive the headless opponent. */
    peerAct(action: AppAction) {
      act(() => {
        if (peer) peer = appReducer(peer, action, seededRng(7), now);
        flushPeer();
      });
    },
  };
}
