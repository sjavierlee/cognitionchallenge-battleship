import { useEffect, useRef, useState, type Dispatch } from 'react';
import type { Link, LinkFactory } from '../net/link';
import { openPeerLink } from '../net/peer';
import type { AppAction, NetState } from './appState';

export const RECONNECT_GRACE_MS = 15_000;
const REDIAL_EVERY_MS = 2_500;

type Options = {
  factory?: LinkFactory;
  graceMs?: number;
};

/**
 * Binds a friend-game `NetState` to a transport: opens the link for the current room, feeds link
 * events into the reducer, flushes the reducer's outbox, runs the reconnect grace timer and
 * redials the host while the guest is reconnecting.
 *
 * Returns the seconds left in the grace period while reconnecting (else null).
 */
export function useP2P(
  net: NetState | null,
  dispatch: Dispatch<AppAction>,
  { factory = openPeerLink, graceMs = RECONNECT_GRACE_MS }: Options = {},
): number | null {
  const linkRef = useRef<Link | null>(null);
  const [linkReady, setLinkReady] = useState(0);
  const [graceLeft, setGraceLeft] = useState<number | null>(null);

  const role = net?.role ?? null;
  const code = net?.code ?? null;
  const session = net?.session ?? null;
  const status = net?.status ?? null;
  const outbox = net?.outbox ?? null;

  // One link per (room, session). A new session (retry / fresh room) tears the old link down.
  useEffect(() => {
    if (!role || !code || !session) return;
    let cancelled = false;
    let link: Link | null = null;

    factory(role, code, {
      onStatus: (s) => {
        if (!cancelled) dispatch({ type: 'link-status', status: s });
      },
      onMessage: (msg) => {
        if (!cancelled) dispatch({ type: 'peer-message', msg });
      },
      onError: (error) => {
        if (!cancelled) dispatch({ type: 'link-error', error });
      },
    })
      .then((l) => {
        if (cancelled) {
          l.close();
          return;
        }
        link = l;
        linkRef.current = l;
        setLinkReady((n) => n + 1);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        dispatch({
          type: 'link-error',
          error: { kind: 'unknown', message: err instanceof Error ? err.message : String(err) },
        });
      });

    return () => {
      cancelled = true;
      if (link) {
        link.send({ t: 'leave' });
        link.close();
      }
      if (linkRef.current === link) linkRef.current = null;
    };
  }, [role, code, session, factory, dispatch]);

  // Flush queued messages whenever the outbox or the channel changes.
  useEffect(() => {
    const link = linkRef.current;
    if (!link || !outbox || outbox.length === 0) return;
    let sent = 0;
    for (const msg of outbox) {
      if (!link.send(msg)) break;
      sent++;
    }
    if (sent > 0) dispatch({ type: 'outbox-sent', count: sent });
  }, [outbox, status, linkReady, dispatch]);

  // Grace period: measured from the first drop, so a flapping channel cannot extend it forever.
  useEffect(() => {
    if (status === 'reconnecting') {
      setGraceLeft((s) => (s === null ? Math.ceil(graceMs / 1000) : s));
    } else if (status !== 'handshake') {
      setGraceLeft(null);
    }
  }, [status, graceMs]);

  useEffect(() => {
    if (graceLeft === null) return;
    if (graceLeft <= 0) {
      dispatch({ type: 'grace-expired' });
      return;
    }
    const id = window.setTimeout(() => setGraceLeft((s) => (s === null ? null : s - 1)), 1000);
    return () => window.clearTimeout(id);
  }, [graceLeft, dispatch]);

  // Guest keeps knocking on the host's door while reconnecting.
  useEffect(() => {
    if (role !== 'guest' || status !== 'reconnecting') return;
    const id = window.setInterval(() => linkRef.current?.redial(), REDIAL_EVERY_MS);
    linkRef.current?.redial();
    return () => window.clearInterval(id);
  }, [role, status]);

  return status === 'reconnecting' || status === 'handshake' ? graceLeft : null;
}
