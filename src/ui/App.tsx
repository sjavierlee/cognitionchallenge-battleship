import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { DIFFICULTIES } from '../ai/huntTarget';
import { playSound } from '../audio/sounds';
import { canPlace, isFleetComplete } from '../engine/board';
import { remaining } from '../engine/clock';
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
  controlRecord,
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
  type TimeControl,
} from '../storage/record';
import {
  appReducer,
  initialAppState,
  OPPONENT_FLAG_GRACE_MS,
  type AppAction,
  type AppState,
} from './appState';
import { Board, type LastShot, type Preview } from './Board';
import { BulletToggle } from './BulletToggle';
import { ClockFace } from './ClockFace';
import { ConnectionBanner } from './ConnectionBanner';
import { DifficultyPicker } from './DifficultyPicker';
import { GameOver, ReviewBar } from './GameOver';
import { Home } from './Home';
import { IconToggle } from './IconToggle';
import { AnchorIcon, MoonIcon, SpeakerOffIcon, SpeakerOnIcon, SunIcon } from './icons';
import { RoomPanel } from './RoomPanel';
import { ShipTray } from './ShipTray';
import { ShotLog } from './ShotLog';
import { useP2P } from './useP2P';
import { useTheme } from './useTheme';

const AI_DELAY_MS = 700;
/** The AI keeps up the pace in Bullet games. */
const BULLET_AI_DELAY_MS = 400;
/** Slack so the clock is really at zero when the reducer checks it. */
const FLAG_SLACK_MS = 20;

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
  /** Game whose summary was dismissed to look at the boards; stale ids fall out on the next game. */
  const [reviewingGame, setReviewingGame] = useState<number | null>(null);
  const { theme, toggleTheme } = useTheme();
  const recordedFor = useRef<number>(-1);
  const playedSeq = useRef<number>(0);

  const {
    mode,
    game,
    difficulty,
    net,
    selectedShip,
    orientation,
    message,
    shotSeq,
    gameId,
    bullet,
    clock,
  } = state;
  const friend = mode === 'friend' && net !== null;
  const placing = game.phase === 'placement';
  const playerTurn = game.phase === 'player-turn';
  const opponentTurn = game.phase === 'opponent-turn';
  const over = game.phase === 'game-over';
  const reviewing = over && reviewingGame === gameId;
  const aiTurn = mode === 'ai' && opponentTurn;

  const graceLeft = useP2P(net, dispatch, { factory: linkFactory, graceMs: reconnectGraceMs });

  // AI takes its turn after a short pause so the player can read the result.
  const aiPause = bullet ? Math.min(aiDelayMs, BULLET_AI_DELAY_MS) : aiDelayMs;
  useEffect(() => {
    if (!aiTurn) return;
    const id = window.setTimeout(() => dispatch({ type: 'ai-fire' }), aiPause);
    return () => window.clearTimeout(id);
  }, [aiTurn, shotSeq, aiPause]);

  // Bullet: call the flag when the running side's clock reaches zero. A friend is given a little
  // grace to report their own flag first, since only they know their clock exactly.
  useEffect(() => {
    if (!clock?.running || clock.flagged) return;
    const theirs = mode === 'friend' && clock.running === 'opponent';
    const left = remaining(clock, clock.running, Date.now());
    const wait = left + FLAG_SLACK_MS + (theirs ? OPPONENT_FLAG_GRACE_MS : 0);
    const id = window.setTimeout(() => dispatch({ type: 'flag' }), wait);
    return () => window.clearTimeout(id);
  }, [clock, mode]);

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
    const seqKey = gameId * 1000 + (over ? 999 : shotSeq);
    if ((!lastLogged && !over) || playedSeq.current === seqKey) return;
    playedSeq.current = seqKey;
    if (!soundOn) return;
    if (over) {
      playSound(game.winner === 'player' ? 'win' : 'lose');
    } else if (lastLogged) {
      playSound(lastLogged.outcome);
    }
  }, [gameId, shotSeq, soundOn, lastLogged, over, game.winner]);

  // Persist the win/loss record once per finished game, under the time control it was played at.
  const control: TimeControl = bullet ? 'bullet' : 'standard';
  useEffect(() => {
    if (!over || recordedFor.current === gameId) return;
    recordedFor.current = gameId;
    const bucket = mode === 'friend' ? 'friend' : difficulty;
    setRecord(commitResult(bucket, game.winner === 'player', control));
  }, [over, gameId, mode, difficulty, game.winner, control]);

  // Keep the displayed record in sync with games finished in other tabs.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === RECORD_KEY) setRecord(loadRecord());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // An invite link pasted into an already-open tab only fires hashchange, not a page load.
  useEffect(() => {
    const onHashChange = () => {
      const code = roomFromHash(window.location.hash);
      if (code) setPendingCode(code);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
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
    clearRecord(control);
    setRecord(loadRecord());
  }, [control]);

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
  const playAgain = useCallback(
    () => dispatch({ type: friend ? 'rematch' : 'play-again' }),
    [friend],
  );
  const closeSummary = useCallback(() => setReviewingGame(gameId), [gameId]);

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
  const playerBadge = playerTurn
    ? waitingOnResult
      ? 'Firing…'
      : 'Your turn'
    : reviewing && isFleetComplete(game.opponent)
      ? 'Revealed'
      : undefined;

  const shown = controlRecord(record, control);
  const hostsRoom = friend && net.role === 'host';

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
          <span
            className={`record${bullet ? ' record--bullet' : ''}`}
            title={`${bullet ? 'Bullet' : 'Standard'} win / loss record (saved in this browser)`}
          >
            {bullet && <span className="record-mode">Bullet</span>}
            <span className="record-tally">
              {shown.wins}W – {shown.losses}L
            </span>
            {shown.wins + shown.losses > 0 && (
              <button
                type="button"
                className="link"
                onClick={resetRecord}
                aria-label={`Reset ${bullet ? 'Bullet' : 'standard'} win/loss record`}
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

          {friend && !placing && !over && (
            <ConnectionBanner
              net={net}
              graceSeconds={graceLeft}
              onClaimWin={() => dispatch({ type: 'claim-win' })}
              onLeave={goHome}
            />
          )}

          {reviewing && (
            <ReviewBar
              game={game}
              net={friend ? net : null}
              enemyName={friend ? enemyName : `The ${difficultyLabel} AI`}
              onPlayAgain={playAgain}
              onHome={goHome}
              onSummary={() => setReviewingGame(null)}
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
                  <>
                    <BulletToggle
                      on={bullet}
                      onChange={(on) => dispatch({ type: 'set-bullet', bullet: on })}
                      locked={!hostsRoom || net.myReady}
                      lockedBy={hostsRoom ? undefined : net.opponent?.name}
                    />
                    <RoomPanel
                      net={net}
                      fleetComplete={isFleetComplete(game.player)}
                      onReady={() => dispatch({ type: 'ready' })}
                      onLeave={goHome}
                      onRetry={() => joinRoom(net.code)}
                    />
                  </>
                ) : (
                  <>
                    <DifficultyPicker
                      value={difficulty}
                      onChange={(d) => dispatch({ type: 'set-difficulty', difficulty: d })}
                    />
                    <BulletToggle
                      on={bullet}
                      onChange={(on) => dispatch({ type: 'set-bullet', bullet: on })}
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
                  clock={clock && <ClockFace clock={clock} side="player" label="Your clock" />}
                  lastShot={lastOpponentShot}
                />
                <Board
                  title={enemyTitle}
                  ariaLabel="Enemy board"
                  board={game.opponent}
                  showShips={reviewing}
                  revealed={reviewing}
                  showFleet
                  disabled={!canFire}
                  active={playerTurn}
                  badge={playerBadge}
                  clock={
                    clock && (
                      <ClockFace clock={clock} side="opponent" label={`${enemyName}'s clock`} />
                    )
                  }
                  lastShot={lastPlayerShot}
                  onCellClick={(at) => dispatch({ type: 'player-fire', at })}
                />
              </div>
              <ShotLog log={game.log} opponentLabel={friend ? enemyName : 'AI'} />
            </main>
          )}

          {over && !reviewing && (
            <GameOver
              game={game}
              difficulty={difficulty}
              record={record}
              net={friend ? net : null}
              clock={clock}
              onPlayAgain={playAgain}
              onHome={goHome}
              onClose={closeSummary}
            />
          )}
        </>
      )}
    </div>
  );
}
