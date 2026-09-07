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
        <h2 id="gameover-title" className="gameover-title">
          {won ? 'Victory!' : 'Defeat'}
        </h2>
        <p className="gameover-sub">
          {won
            ? `You sank the entire enemy fleet in ${mine.length} shots.`
            : `The ${label} AI sank your fleet in ${theirs.length} shots.`}
        </p>
        <dl className="gameover-stats">
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
        <button type="button" className="btn btn--primary" onClick={onPlayAgain} autoFocus>
          Play again
        </button>
      </div>
    </div>
  );
}
