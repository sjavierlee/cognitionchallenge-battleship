import { useEffect, useState } from 'react';
import { roomHash } from '../net/roomCode';
import { firstMover, type NetState } from './appState';
import { CheckIcon, CopyIcon } from './icons';

type Props = {
  net: NetState;
  fleetComplete: boolean;
  onReady: () => void;
  onLeave: () => void;
  onRetry: () => void;
};

function shareUrl(code: string): string {
  return `${window.location.origin}${window.location.pathname}${roomHash(code)}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function connectionLine(net: NetState): { text: string; tone: 'idle' | 'live' | 'warn' | 'bad' } {
  const who = net.opponent?.name ?? 'your friend';
  switch (net.status) {
    case 'connecting':
      return {
        text: net.role === 'host' ? 'Opening room…' : `Looking for room ${net.code}…`,
        tone: 'idle',
      };
    case 'waiting':
      return { text: 'Waiting for a friend to join…', tone: 'idle' };
    case 'handshake':
      return { text: 'Connected — saying hello…', tone: 'idle' };
    case 'connected':
      return { text: `Connected with ${who}`, tone: 'live' };
    case 'reconnecting':
      return { text: `Reconnecting to ${who}…`, tone: 'warn' };
    case 'lost':
      return { text: `${who} did not come back.`, tone: 'bad' };
    case 'left':
      return { text: `${who} left.`, tone: 'bad' };
    case 'error':
      return { text: 'Could not connect.', tone: 'bad' };
  }
}

export function RoomPanel({ net, fleetComplete, onReady, onLeave, onRetry }: Props) {
  const [copied, setCopied] = useState<'link' | 'code' | null>(null);
  const line = connectionLine(net);
  const gone = net.status === 'lost' || net.status === 'left' || net.status === 'error';

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(null), 1600);
    return () => window.clearTimeout(id);
  }, [copied]);

  const readyLabel = net.myReady
    ? net.theirReady
      ? 'Starting…'
      : `Waiting for ${net.opponent?.name ?? 'your friend'}…`
    : 'Ready';

  return (
    <section className="panel room" aria-label="Friend game">
      <div className="panel-head">
        <h2 className="panel-title">{net.role === 'host' ? 'Your room' : 'Joined room'}</h2>
        <span className="panel-meta">
          {firstMover(net) === 'player'
            ? 'You fire first'
            : `${net.opponent?.name ?? (net.role === 'host' ? 'Guest' : 'Host')} fires first`}
        </span>
      </div>

      <div className="room-code-row">
        <span className="room-code" aria-label={`Room code ${net.code.split('').join(' ')}`}>
          {net.code}
        </span>
        <button
          type="button"
          className="btn btn--icon room-copy"
          onClick={async () => {
            if (await copyText(net.code)) setCopied('code');
          }}
          aria-label="Copy room code"
          title="Copy code"
        >
          {copied === 'code' ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>

      {net.role === 'host' && (
        <button
          type="button"
          className="btn room-share"
          onClick={async () => {
            if (await copyText(shareUrl(net.code))) setCopied('link');
          }}
        >
          {copied === 'link' ? <CheckIcon /> : <CopyIcon />}
          {copied === 'link' ? 'Link copied' : 'Copy invite link'}
        </button>
      )}

      <p className={`room-status room-status--${line.tone}`} role="status">
        <span className="room-dot" aria-hidden="true" />
        {line.text}
      </p>

      {net.opponent && !gone && (
        <p className="room-opponent">
          <strong>{net.opponent.name}</strong>{' '}
          {net.theirReady ? 'is ready.' : 'is placing their fleet.'}
        </p>
      )}

      <div className="room-actions">
        {gone ? (
          <>
            {net.status === 'error' && net.role === 'guest' && (
              <button type="button" className="btn btn--primary" onClick={onRetry}>
                Try again
              </button>
            )}
            <button type="button" className="btn" onClick={onLeave}>
              Back to home
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn btn--primary btn--big"
              onClick={onReady}
              disabled={net.myReady || !fleetComplete || net.status !== 'connected'}
              title={
                net.status !== 'connected'
                  ? 'Waiting for your friend to connect'
                  : fleetComplete
                    ? undefined
                    : 'Place all five ships first'
              }
            >
              {readyLabel}
            </button>
            <button type="button" className="btn btn--ghost" onClick={onLeave}>
              Leave
            </button>
          </>
        )}
      </div>
    </section>
  );
}
