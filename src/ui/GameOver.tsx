import { useEffect, type CSSProperties } from 'react';
import { DIFFICULTIES, type Difficulty } from '../ai/huntTarget';
import { isFleetComplete } from '../engine/board';
import type { GameState } from '../engine/types';
import type { GameRecord } from '../storage/record';
import type { NetState } from './appState';
import { CloseIcon } from './icons';

type ActionProps = {
  net: NetState | null;
  onPlayAgain: () => void;
  onHome: () => void;
  /** Overlay buttons are larger and take focus; the review bar's are regular size. */
  prominent?: boolean;
};

/** Rematch / Play again and Back to home, shared by the overlay and the post-game review bar. */
export function GameOverActions({ net, onPlayAgain, onHome, prominent = false }: ActionProps) {
  const friend = net !== null;
  const connected = friend && net.status === 'connected';
  const label = !friend
    ? 'Play again'
    : net.rematchMine
      ? `Waiting for ${net.opponent?.name ?? 'your friend'}…`
      : net.rematchTheirs
        ? 'Accept rematch'
        : 'Rematch';
  const big = prominent ? ' btn--big' : '';
  return (
    <>
      {(!friend || connected) && (
        <button
          type="button"
          className={`btn btn--primary${big}`}
          onClick={onPlayAgain}
          disabled={friend && net.rematchMine}
          autoFocus={prominent}
        >
          {label}
        </button>
      )}
      <button
        type="button"
        className={`btn${big}${friend && !connected ? ' btn--primary' : ''}`}
        onClick={onHome}
        autoFocus={prominent && friend && !connected}
      >
        Back to home
      </button>
    </>
  );
}

type Props = {
  game: GameState;
  difficulty: Difficulty;
  record: GameRecord;
  net: NetState | null;
  onPlayAgain: () => void;
  onHome: () => void;
  /** Dismisses the summary to look at the boards with the enemy fleet revealed. */
  onClose: () => void;
};

export function GameOver({ game, difficulty, record, net, onPlayAgain, onHome, onClose }: Props) {
  const won = game.winner === 'player';
  const mine = game.log.filter((s) => s.by === 'player');
  const hits = mine.filter((s) => s.outcome !== 'miss').length;
  const accuracy = mine.length ? Math.round((hits / mine.length) * 100) : 0;
  const theirs = game.log.filter((s) => s.by === 'opponent');
  const label = DIFFICULTIES.find((d) => d.id === difficulty)?.label ?? difficulty;
  const friend = net !== null;
  const enemy = friend ? (net.opponent?.name ?? 'Your friend') : `The ${label} AI`;
  const tally = friend ? record.friend : record.perDifficulty[difficulty];
  const forfeit = friend && net.forfeit;

  const kicker = forfeit
    ? `${won ? `${enemy} left` : 'You were away'} · Friend game`
    : `${won ? 'Enemy fleet destroyed' : 'Fleet lost'} · ${friend ? 'Friend game' : `${label} AI`}`;
  const shots = (n: number) => `${n} ${n === 1 ? 'shot' : 'shots'}`;
  const sub = forfeit
    ? won
      ? 'The win is yours by forfeit.'
      : `${enemy} claimed the win by forfeit while you were disconnected.`
    : won
      ? `You sank the entire enemy fleet in ${shots(mine.length)}.`
      : `${enemy} sank your fleet in ${shots(theirs.length)}.`;

  const connected = friend && net.status === 'connected';
  const reconnecting = friend && (net.status === 'reconnecting' || net.status === 'handshake');

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="gameover-title">
      <div className={`gameover gameover--${won ? 'win' : 'lose'}`}>
        <button
          type="button"
          className="icon-btn gameover-close"
          onClick={onClose}
          aria-label="Close summary and reveal the enemy fleet"
          title="Reveal the enemy fleet"
        >
          <CloseIcon />
        </button>
        <p className="gameover-kicker stagger" style={{ '--i': 0 } as CSSProperties}>
          {kicker}
        </p>
        <h2
          id="gameover-title"
          className="gameover-title stagger"
          style={{ '--i': 1 } as CSSProperties}
        >
          {won ? 'Victory!' : 'Defeat'}
        </h2>
        <p className="gameover-sub stagger" style={{ '--i': 2 } as CSSProperties}>
          {sub}
        </p>
        <dl className="gameover-stats stagger" style={{ '--i': 3 } as CSSProperties}>
          <div>
            <dt>Your shots</dt>
            <dd>{mine.length}</dd>
          </div>
          <div>
            <dt>Accuracy</dt>
            <dd>{accuracy}%</dd>
          </div>
          <div>
            <dt>{friend ? 'Record vs friends' : `Record vs ${label}`}</dt>
            <dd>
              {tally.wins}W – {tally.losses}L
            </dd>
          </div>
          <div>
            <dt>Overall</dt>
            <dd>
              {record.wins}W – {record.losses}L
            </dd>
          </div>
        </dl>
        {friend && net.rematchTheirs && !net.rematchMine && (
          <p className="gameover-note stagger" style={{ '--i': 4 } as CSSProperties} role="status">
            {net.opponent?.name ?? 'Your friend'} wants a rematch!
          </p>
        )}
        {friend && !connected && (
          <p className="gameover-note stagger" style={{ '--i': 4 } as CSSProperties}>
            {reconnecting
              ? `Reconnecting to ${net.opponent?.name ?? 'your friend'}…`
              : `${net.opponent?.name ?? 'Your friend'} has left, so a rematch is not available.`}
          </p>
        )}
        <div className="gameover-actions stagger" style={{ '--i': 5 } as CSSProperties}>
          <GameOverActions net={net} onPlayAgain={onPlayAgain} onHome={onHome} prominent />
        </div>
        <p className="gameover-hint stagger" style={{ '--i': 6 } as CSSProperties}>
          <button type="button" className="link" onClick={onClose}>
            Close to see where {friend ? `${enemy}'s` : 'the enemy'} ships were
          </button>
        </p>
      </div>
    </div>
  );
}

type ReviewProps = {
  game: GameState;
  net: NetState | null;
  enemyName: string;
  onPlayAgain: () => void;
  onHome: () => void;
  /** Re-opens the summary overlay. */
  onSummary: () => void;
};

/** Sits above the boards once the summary is dismissed, keeping the end-of-game actions handy. */
export function ReviewBar({ game, net, enemyName, onPlayAgain, onHome, onSummary }: ReviewProps) {
  const won = game.winner === 'player';
  const revealed = isFleetComplete(game.opponent);
  const detail = revealed
    ? `${enemyName}'s fleet is revealed on their board.`
    : `${enemyName} has not revealed their fleet — only the ships you sank are shown.`;
  return (
    <div className={`banner review review--${won ? 'win' : 'lose'}`} role="status">
      <span>
        <strong className="review-outcome">{won ? 'Victory' : 'Defeat'}</strong>
        {' · '}
        {detail}
      </span>
      <div className="banner-actions">
        <button type="button" className="btn btn--ghost" onClick={onSummary}>
          Summary
        </button>
        <GameOverActions net={net} onPlayAgain={onPlayAgain} onHome={onHome} />
      </div>
    </div>
  );
}
