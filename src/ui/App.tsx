import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { DIFFICULTIES } from '../ai/huntTarget';
import { playSound } from '../audio/sounds';
import { canPlace, isFleetComplete } from '../engine/board';
import { inBounds, shipCells } from '../engine/coords';
import { defaultRng, type Rng } from '../engine/rng';
import { shipSpec } from '../engine/ships';
import type { Coord } from '../engine/types';
import type { LinkFactory } from '../net/link';
import { sanitizeName } from '../net/protocol';
import { generateRoomCode, roomFromHash, roomHash } from '../net/roomCode';
import {
  clearRecord,
  commitResult,
  loadLastMode,
  loadPlayerName,
  loadRecord,
  loadSoundEnabled,
  RECORD_KEY,
  saveLastMode,
  savePlayerName,
  saveSoundEnabled,
  type GameRecord,
  type LastMode,
} from '../storage/record';
import { appReducer, initialAppState, type AppAction, type AppState } from './appState';
import { Board, type LastShot, type Preview } from './Board';
import { ConnectionBanner } from './ConnectionBanner';
import { DifficultyPicker } from './DifficultyPicker';
import { GameOver } from './GameOver';
import { Home } from './Home';
import { IconToggle } from './IconToggle';
import { AnchorIcon, MoonIcon, SpeakerOffIcon, SpeakerOnIcon, SunIcon } from './icons';
import { RoomPanel } from './RoomPanel';
import { ShipTray } from './ShipTray';
import { ShotLog } from './ShotLog';
import { useP2P } from './useP2P';
import { useTheme } from './useTheme';

const AI_DELAY_MS = 700;

type Props = {
  /** Random source for fleet placement and AI shots; injectable for deterministic tests. */
  rng?: Rng;
  aiDelayMs?: number;
  /** Transport for friend games; injectable so tests never touch the network. */
  linkFactory?: LinkFactory;
  reconnectGraceMs?: number;
};

function newSession(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function setHash(hash: string) {
  const url = `${window.location.pathname}${window.location.search}${hash}`;
  window.history.replaceState(null, '', url);
}

export function App({
  rng = defaultRng,
  aiDelayMs = AI_DELAY_MS,
  linkFactory,
  reconnectGraceMs,
}: Props = {}) {
  const reducer = useCallback((s: AppState, a: AppAction) => appReducer(s, a, rng), [rng]);
  const [state, dispatch] = useReducer(reducer, undefined, () => initialAppState());
  const [hover, setHover] = useState<Coord | null>(null);
  const [record, setRecord] = useState<GameRecord>(() => loadRecord());
  const [soundOn, setSoundOn] = useState<boolean>(() => loadSoundEnabled());
  const [name, setName] = useState<string>(() => loadPlayerName());
  const [lastMode, setLastMode] = useState<LastMode | null>(() => loadLastMode());
  const [pendingCode, setPendingCode] = useState<string | null>(() =>
    roomFromHash(window.location.hash),
  );
  const { theme, toggleTheme } = useTheme();
  const recordedFor = useRef<number>(-1);
  const playedSeq = useRef<number>(0);

  const { mode, game, difficulty, net, selectedShip, orientation, message, shotSeq, gameId } =
    state;
  const friend = mode === 'friend' && net !== null;
  const placing = game.phase === 'placement';
  const playerTurn = game.phase === 'player-turn';
  const opponentTurn = game.phase === 'opponent-turn';
  const over = game.phase === 'game-over';
  const aiTurn = mode === 'ai' && opponentTurn;

  const graceLeft = useP2P(net, dispatch, { factory: linkFactory, graceMs: reconnectGraceMs });

  // AI takes its turn after a short pause so the player can read the result.
  useEffect(() => {
    if (!aiTurn) return;
    const id = window.setTimeout(() => dispatch({ type: 'ai-fire' }), aiDelayMs);
    return () => window.clearTimeout(id);
  }, [aiTurn, shotSeq, aiDelayMs]);

  // Keyboard: R rotates during placement.
  useEffect(() => {
    if (!placing || mode === 'home') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'r' || e.key === 'R') dispatch({ type: 'rotate' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [placing, mode]);

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
    setRecord(commitResult(mode === 'friend' ? 'friend' : difficulty, game.winner === 'player'));
  }, [over, gameId, mode, difficulty, game.winner]);

  // Keep the displayed record in sync with games finished in other tabs.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === RECORD_KEY) setRecord(loadRecord());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // The room code lives in the URL so the host can share it; clear it when leaving.
  const roomCode = friend ? net.code : null;
  useEffect(() => {
    if (roomCode) setHash(roomHash(roomCode));
    else if (mode !== 'home' || !pendingCode) setHash('');
  }, [roomCode, mode, pendingCode]);

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

  const rememberMode = useCallback((m: LastMode) => {
    saveLastMode(m);
    setLastMode(m);
    setPendingCode(null);
  }, []);

  const changeName = useCallback((n: string) => {
    setName(n);
    savePlayerName(n);
  }, []);

  const playAi = useCallback(() => {
    rememberMode('ai');
    dispatch({ type: 'play-ai' });
  }, [rememberMode]);

  const hostRoom = useCallback(() => {
    rememberMode('friend');
    dispatch({
      type: 'host-room',
      code: generateRoomCode(rng),
      name: sanitizeName(name),
      session: newSession(),
    });
  }, [rememberMode, rng, name]);

  const joinRoom = useCallback(
    (code: string) => {
      rememberMode('friend');
      dispatch({ type: 'join-room', code, name: sanitizeName(name), session: newSession() });
    },
    [rememberMode, name],
  );

  const goHome = useCallback(() => dispatch({ type: 'go-home' }), []);

  const preview: Preview = useMemo(() => {
    if (!placing || !hover || !selectedShip) return null;
    if (friend && net.myReady) return null;
    const spec = shipSpec(selectedShip);
    const footprint = shipCells(hover, spec.size, orientation);
    const cells = footprint.filter(inBounds);
    return {
      cells,
      valid: canPlace(game.player, spec, hover, orientation),
      ghost:
        cells.length === footprint.length
          ? { kind: selectedShip, origin: hover, orientation }
          : null,
    };
  }, [placing, hover, selectedShip, orientation, game.player, friend, net]);

  const lastShot: LastShot = lastLogged
    ? { at: lastLogged.at, outcome: lastLogged.outcome, seq: shotSeq }
    : null;
  const lastPlayerShot = lastShot && lastLogged?.by === 'player' ? lastShot : null;
  const lastOpponentShot = lastShot && lastLogged?.by === 'opponent' ? lastShot : null;

  const difficultyLabel = DIFFICULTIES.find((d) => d.id === difficulty)?.label ?? difficulty;
  const enemyName = friend ? (net.opponent?.name ?? 'Your friend') : `${difficultyLabel} AI`;
  const enemyTitle = friend ? `${enemyName}'s waters` : `Enemy waters (${difficultyLabel} AI)`;
  const placementLocked = friend && net.myReady;
  const linkUp = !friend || net.status === 'connected';
  const waitingOnResult = friend && net.pendingFire !== null;
  const canFire = playerTurn && linkUp && !waitingOnResult;

  const opponentBadge = opponentTurn ? (friend ? `${enemyName}'s turn` : 'Incoming…') : undefined;
  const playerBadge = playerTurn ? (waitingOnResult ? 'Firing…' : 'Your turn') : undefined;

  return (
    <div className="app">
      <header className="header">
        <h1 className="title">
          <AnchorIcon className="title-mark" />
          Battleship
        </h1>
        <div className="header-right">
          {mode !== 'home' && (
            <button type="button" className="btn btn--ghost header-home" onClick={goHome}>
              Home
            </button>
          )}
          <span className="record" title="Win / loss record (saved in this browser)">
            <span className="record-tally">
              {record.wins}W – {record.losses}L
            </span>
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
          <IconToggle
            pressed={soundOn}
            onToggle={toggleSound}
            labelOn="Mute sound"
            labelOff="Enable sound"
            iconOn={<SpeakerOnIcon />}
            iconOff={<SpeakerOffIcon />}
          />
          <IconToggle
            pressed={theme === 'dark'}
            onToggle={toggleTheme}
            labelOn="Switch to light mode"
            labelOff="Switch to dark mode"
            iconOn={<MoonIcon />}
            iconOff={<SunIcon />}
          />
        </div>
      </header>

      {mode === 'home' ? (
        <Home
          name={name}
          onNameChange={changeName}
          lastMode={lastMode}
          pendingCode={pendingCode}
          onPlayAi={playAi}
          onHost={hostRoom}
          onJoin={joinRoom}
        />
      ) : (
        <>
          <p className={`status status--${game.phase}`} role="status" aria-live="polite">
            {message}
          </p>

          {friend && !placing && (
            <ConnectionBanner
              net={net}
              graceSeconds={graceLeft}
              onClaimWin={() => dispatch({ type: 'claim-win' })}
              onLeave={goHome}
            />
          )}

          {placing ? (
            <main className="layout layout--placement">
              <Board
                title="Your fleet"
                ariaLabel="Your board"
                board={game.player}
                showShips
                active={!placementLocked}
                disabled={placementLocked}
                badge={placementLocked ? 'Ready' : undefined}
                preview={preview}
                onCellClick={(at) => dispatch({ type: 'place-at', at })}
                onCellHover={setHover}
              />
              <div className="sidebar">
                <ShipTray
                  board={game.player}
                  selected={placementLocked ? null : selectedShip}
                  orientation={orientation}
                  disabled={placementLocked}
                  onSelect={(kind) => dispatch({ type: 'select-ship', kind })}
                  onPickUp={(kind) => dispatch({ type: 'pick-up', kind })}
                  onRotate={() => dispatch({ type: 'rotate' })}
                  onRandomize={() => dispatch({ type: 'randomize' })}
                  onReset={() => dispatch({ type: 'reset-fleet' })}
                />
                {friend ? (
                  <RoomPanel
                    net={net}
                    fleetComplete={isFleetComplete(game.player)}
                    onReady={() => dispatch({ type: 'ready' })}
                    onLeave={goHome}
                    onRetry={() => joinRoom(net.code)}
                  />
                ) : (
                  <>
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
                      {game.player.ships.length < 5
                        ? `Start battle (${5 - game.player.ships.length} to place)`
                        : 'Start battle'}
                    </button>
                  </>
                )}
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
                  showFleet
                  disabled
                  active={opponentTurn}
                  badge={opponentBadge}
                  lastShot={lastOpponentShot}
                />
                <Board
                  title={enemyTitle}
                  ariaLabel="Enemy board"
                  board={game.opponent}
                  showShips={false}
                  showFleet
                  disabled={!canFire}
                  active={playerTurn}
                  badge={playerBadge}
                  lastShot={lastPlayerShot}
                  onCellClick={(at) => dispatch({ type: 'player-fire', at })}
                />
              </div>
              <ShotLog log={game.log} opponentLabel={friend ? enemyName : 'AI'} />
            </main>
          )}

          {over && (
            <GameOver
              game={game}
              difficulty={difficulty}
              record={record}
              net={friend ? net : null}
              onPlayAgain={() => dispatch({ type: friend ? 'rematch' : 'play-again' })}
              onHome={goHome}
            />
          )}
        </>
      )}
    </div>
  );
}
