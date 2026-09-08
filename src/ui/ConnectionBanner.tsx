import type { NetState } from './appState';

type Props = {
  net: NetState;
  graceSeconds: number | null;
  onClaimWin: () => void;
  onLeave: () => void;
};

/** Shown above the boards while a friend game is not cleanly connected. */
export function ConnectionBanner({ net, graceSeconds, onClaimWin, onLeave }: Props) {
  const who = net.opponent?.name ?? 'Your friend';
  if (net.status === 'connected') return null;

  if (net.status === 'reconnecting' || net.status === 'handshake') {
    return (
      <div className="banner banner--warn" role="status">
        <span className="banner-spinner" aria-hidden="true" />
        <span>
          Connection lost. Reconnecting to {who}
          {graceSeconds !== null ? ` — ${graceSeconds}s` : '…'}
        </span>
        <button type="button" className="btn btn--ghost" onClick={onLeave}>
          Leave
        </button>
      </div>
    );
  }

  if (net.status === 'lost' || net.status === 'left') {
    return (
      <div className="banner banner--bad" role="alert">
        <span>{net.status === 'left' ? `${who} left the game.` : `${who} did not reconnect.`}</span>
        <div className="banner-actions">
          <button type="button" className="btn btn--primary" onClick={onClaimWin}>
            Claim win
          </button>
          <button type="button" className="btn btn--ghost" onClick={onLeave}>
            Back to home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="banner banner--bad" role="alert">
      <span>Connection failed.</span>
      <button type="button" className="btn btn--ghost" onClick={onLeave}>
        Back to home
      </button>
    </div>
  );
}
