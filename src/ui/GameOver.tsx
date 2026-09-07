import type { CSSProperties } from 'react';
import { DIFFICULTIES, type Difficulty } from '../ai/huntTarget';
import type { GameState } from '../engine/types';
import type { GameRecord } from '../storage/record';

type Props = {
  game: GameState;
  difficulty: Difficulty;
  record: GameRecord;
  onPlayAgain: () => void;
};

export function GameOver({ game, difficulty, record, onPlayAgain }: Props) {
  const won = game.winner === 'player';
  const mine = game.log.filter((s) => s.by === 'player');
  const hits = mine.filter((s) => s.outcome !== 'miss').length;
  const accuracy = mine.length ? Math.round((hits / mine.length) * 100) : 0;
  const theirs = game.log.filter((s) => s.by === 'ai');
  const label = DIFFICULTIES.find((d) => d.id === difficulty)?.label ?? difficulty;
  const tally = record.perDifficulty[difficulty];

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="gameover-title">
      <div className={`gameover gameover--${won ? 'win' : 'lose'}`}>
        <p className="gameover-kicker stagger" style={{ '--i': 0 } as CSSProperties}>
          {won ? 'Enemy fleet destroyed' : 'Fleet lost'} · {label} AI
        </p>
        <h2
          id="gameover-title"
          className="gameover-title stagger"
          style={{ '--i': 1 } as CSSProperties}
        >
          {won ? 'Victory!' : 'Defeat'}
        </h2>
        <p className="gameover-sub stagger" style={{ '--i': 2 } as CSSProperties}>
          {won
            ? `You sank the entire enemy fleet in ${mine.length} shots.`
            : `The ${label} AI sank your fleet in ${theirs.length} shots.`}
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
            <dt>Record vs {label}</dt>
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
        <div className="stagger" style={{ '--i': 4 } as CSSProperties}>
          <button
            type="button"
            className="btn btn--primary btn--big"
            onClick={onPlayAgain}
            autoFocus
          >
            Play again
          </button>
        </div>
      </div>
    </div>
  );
}
