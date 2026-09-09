import type { CSSProperties } from 'react';
import { DIFFICULTIES, type Difficulty } from '../ai/huntTarget';
import type { GameState } from '../engine/types';
import type { GameRecord } from '../storage/record';
import type { NetState } from './appState';

type Props = {
  game: GameState;
  difficulty: Difficulty;
  record: GameRecord;
  net: NetState | null;
  onPlayAgain: () => void;
  onHome: () => void;
};

export function GameOver({ game, difficulty, record, net, onPlayAgain, onHome }: Props) {
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
    ? `${enemy} left · Friend game`
    : `${won ? 'Enemy fleet destroyed' : 'Fleet lost'} · ${friend ? 'Friend game' : `${label} AI`}`;
  const shots = (n: number) => `${n} ${n === 1 ? 'shot' : 'shots'}`;
  const sub = forfeit
    ? 'The win is yours by forfeit.'
    : won
      ? `You sank the entire enemy fleet in ${shots(mine.length)}.`
      : `${enemy} sank your fleet in ${shots(theirs.length)}.`;

  const connected = friend && net.status === 'connected';
  const rematchLabel = !friend
    ? 'Play again'
    : net.rematchMine
      ? `Waiting for ${net.opponent?.name ?? 'your friend'}…`
      : net.rematchTheirs
        ? 'Accept rematch'
        : 'Rematch';

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="gameover-title">
      <div className={`gameover gameover--${won ? 'win' : 'lose'}`}>
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
            {net.opponent?.name ?? 'Your friend'} has left, so a rematch is not available.
          </p>
        )}
        <div className="gameover-actions stagger" style={{ '--i': 5 } as CSSProperties}>
          {(!friend || connected) && (
            <button
              type="button"
              className="btn btn--primary btn--big"
              onClick={onPlayAgain}
              disabled={friend && net.rematchMine}
              autoFocus
            >
              {rematchLabel}
            </button>
          )}
          <button
            type="button"
            className={`btn btn--big${friend && !connected ? ' btn--primary' : ''}`}
            onClick={onHome}
            autoFocus={friend && !connected}
          >
            Back to home
          </button>
        </div>
      </div>
    </div>
  );
}
