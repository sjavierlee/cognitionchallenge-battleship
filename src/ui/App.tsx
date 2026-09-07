import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { DIFFICULTIES } from '../ai/huntTarget';
import { playSound } from '../audio/sounds';
import { canPlace } from '../engine/board';
import { inBounds, shipCells } from '../engine/coords';
import { shipSpec } from '../engine/ships';
import type { Coord } from '../engine/types';
import {
  clearRecord,
  commitResult,
  loadRecord,
  loadSoundEnabled,
  RECORD_KEY,
  saveSoundEnabled,
  type GameRecord,
} from '../storage/record';
import { appReducer, initialAppState } from './appState';
import { Board, type LastShot, type Preview } from './Board';
import { DifficultyPicker } from './DifficultyPicker';
import { GameOver } from './GameOver';
import { ShipTray } from './ShipTray';
import { ShotLog } from './ShotLog';

const AI_DELAY_MS = 700;

export function App() {
  const [state, dispatch] = useReducer(appReducer, undefined, () => initialAppState());
  const [hover, setHover] = useState<Coord | null>(null);
  const [record, setRecord] = useState<GameRecord>(() => loadRecord());
  const [soundOn, setSoundOn] = useState<boolean>(() => loadSoundEnabled());
  const recordedFor = useRef<number>(-1);
  const playedSeq = useRef<number>(0);

  const { game, difficulty, selectedShip, orientation, message, shotSeq, gameId } = state;
  const placing = game.phase === 'placement';
  const playerTurn = game.phase === 'player-turn';
  const aiTurn = game.phase === 'ai-turn';
  const over = game.phase === 'game-over';

  // AI takes its turn after a short pause so the player can read the result.
  useEffect(() => {
    if (!aiTurn) return;
    const id = window.setTimeout(() => dispatch({ type: 'ai-fire' }), AI_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [aiTurn, shotSeq]);

  // Keyboard: R rotates during placement.
  useEffect(() => {
    if (!placing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') dispatch({ type: 'rotate' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [placing]);

  // Sounds for the latest shot / result.
  const lastLogged = game.log[game.log.length - 1];
  useEffect(() => {
    const seqKey = gameId * 1000 + shotSeq;
    if (!lastLogged || playedSeq.current === seqKey) return;
    playedSeq.current = seqKey;
    if (!soundOn) return;
    if (over) {
      playSound(game.winner === 'player' ? 'win' : 'lose');
    } else {
      playSound(lastLogged.outcome);
    }
  }, [gameId, shotSeq, soundOn, lastLogged, over, game.winner]);

  // Persist the win/loss record once per finished game.
  useEffect(() => {
    if (!over || recordedFor.current === gameId) return;
    recordedFor.current = gameId;
    setRecord(commitResult(difficulty, game.winner === 'player'));
  }, [over, gameId, difficulty, game.winner]);

  // Keep the displayed record in sync with games finished in other tabs.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === RECORD_KEY) setRecord(loadRecord());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggleSound = useCallback(() => {
    setSoundOn((on) => {
      saveSoundEnabled(!on);
      return !on;
    });
  }, []);

  const resetRecord = useCallback(() => {
    clearRecord();
    setRecord(loadRecord());
  }, []);

  const preview: Preview = useMemo(() => {
    if (!placing || !hover || !selectedShip) return null;
    const spec = shipSpec(selectedShip);
    return {
      cells: shipCells(hover, spec.size, orientation).filter(inBounds),
      valid: canPlace(game.player, spec, hover, orientation),
    };
  }, [placing, hover, selectedShip, orientation, game.player]);

  const lastShot: LastShot = lastLogged
    ? { at: lastLogged.at, outcome: lastLogged.outcome, seq: shotSeq }
    : null;
  const lastPlayerShot = lastShot && lastLogged?.by === 'player' ? lastShot : null;
  const lastAiShot = lastShot && lastLogged?.by === 'ai' ? lastShot : null;

  const difficultyLabel = DIFFICULTIES.find((d) => d.id === difficulty)?.label ?? difficulty;

  return (
    <div className="app">
      <header className="header">
        <h1 className="title">Battleship</h1>
        <div className="header-right">
          <span className="record" title="Win / loss record (saved in this browser)">
            {record.wins}W – {record.losses}L
            {record.wins + record.losses > 0 && (
              <button
                type="button"
                className="link"
                onClick={resetRecord}
                aria-label="Reset win/loss record"
              >
                reset
              </button>
            )}
          </span>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={toggleSound}
            aria-pressed={soundOn}
            aria-label={soundOn ? 'Mute sound' : 'Enable sound'}
          >
            {soundOn ? 'Sound on' : 'Sound off'}
          </button>
        </div>
      </header>

      <p className="status" role="status" aria-live="polite">
        {message}
      </p>

      {placing ? (
        <main className="layout layout--placement">
          <Board
            title="Your fleet"
            ariaLabel="Your board"
            board={game.player}
            showShips
            active
            preview={preview}
            onCellClick={(at) => dispatch({ type: 'place-at', at })}
            onCellHover={setHover}
          />
          <div className="sidebar">
            <ShipTray
              board={game.player}
              selected={selectedShip}
              orientation={orientation}
              onSelect={(kind) => dispatch({ type: 'select-ship', kind })}
              onPickUp={(kind) => dispatch({ type: 'pick-up', kind })}
              onRotate={() => dispatch({ type: 'rotate' })}
              onRandomize={() => dispatch({ type: 'randomize' })}
              onReset={() => dispatch({ type: 'reset-fleet' })}
            />
            <DifficultyPicker
              value={difficulty}
              onChange={(d) => dispatch({ type: 'set-difficulty', difficulty: d })}
            />
            <button
              type="button"
              className="btn btn--primary btn--big"
              disabled={game.player.ships.length < 5}
              onClick={() => dispatch({ type: 'start' })}
            >
              Start battle
            </button>
          </div>
        </main>
      ) : (
        <main className="layout layout--battle">
          <div className="boards">
            <Board
              title="Your fleet"
              ariaLabel="Your board"
              board={game.player}
              showShips
              disabled
              active={aiTurn}
              lastShot={lastAiShot}
            />
            <Board
              title={`Enemy waters (${difficultyLabel} AI)`}
              ariaLabel="Enemy board"
              board={game.ai}
              showShips={false}
              disabled={!playerTurn}
              active={playerTurn}
              lastShot={lastPlayerShot}
              onCellClick={(at) => dispatch({ type: 'player-fire', at })}
            />
          </div>
          <ShotLog log={game.log} />
        </main>
      )}

      {over && (
        <GameOver
          game={game}
          difficulty={difficulty}
          record={record}
          onPlayAgain={() => dispatch({ type: 'play-again' })}
        />
      )}
    </div>
  );
}
