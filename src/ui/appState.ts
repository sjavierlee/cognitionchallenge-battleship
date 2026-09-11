import { chooseShot, createAi, observe, type AiState, type Difficulty } from '../ai/huntTarget';
import {
  canPlace,
  createBoard,
  isFleetComplete,
  isShotAlready,
  placeShip,
  randomizeFleet,
  removeShip,
  revealFleet,
  shipAt,
} from '../engine/board';
import { createClock, flagClock, remaining, runClock, type Clock } from '../engine/clock';
import { coordLabel, sameCoord, shipOrientation } from '../engine/coords';
import {
  applyShotResult,
  createGame,
  fire,
  setPlayerBoard,
  startGame,
  startVersus,
} from '../engine/game';
import { defaultRng, type Rng } from '../engine/rng';
import { FLEET, shipSpec } from '../engine/ships';
import type { Coord, GameState, Orientation, Player, ShipKind, ShotResult } from '../engine/types';
import type { LinkError, LinkStatus, Role } from '../net/link';
import { PROTOCOL_VERSION, type NetMessage } from '../net/protocol';

export type Mode = 'home' | 'ai' | 'friend';

export type PeerStatus =
  'connecting' | 'waiting' | 'handshake' | 'connected' | 'reconnecting' | 'lost' | 'left' | 'error';

type ResultMessage = Extract<NetMessage, { t: 'result' }>;

export type NetState = {
  role: Role;
  code: string;
  myName: string;
  /** Random per-page-load token; lets a reconnecting opponent be told apart from a new one. */
  session: string;
  status: PeerStatus;
  error: string | null;
  opponent: { name: string; session: string } | null;
  myReady: boolean;
  theirReady: boolean;
  /** 0-based; the host fires first in even-numbered games, the guest in odd ones. */
  gameNumber: number;
  /** Sequence number for my next `fire`. */
  seq: number;
  /** Number of `fire` messages I have answered; the next one must carry this seq. */
  theirSeq: number;
  pendingFire: { seq: number; at: Coord } | null;
  /** Last result I sent, re-sent if the opponent repeats a `fire` after a reconnect. */
  lastResult: ResultMessage | null;
  rematchMine: boolean;
  rematchTheirs: boolean;
  /** The game ended because the opponent left rather than by sinking a fleet. */
  forfeit: boolean;
  /** Messages waiting to be handed to the transport, in order. */
  outbox: NetMessage[];
};

export type AppState = {
  mode: Mode;
  game: GameState;
  difficulty: Difficulty;
  ai: AiState;
  net: NetState | null;
  selectedShip: ShipKind | null;
  orientation: Orientation;
  message: string;
  /** Increments on every shot so the UI can re-trigger animations. */
  shotSeq: number;
  /** Increments on every new game so per-game side effects run exactly once. */
  gameId: number;
  /** Bullet time control chosen in the lobby (the host's choice in a friend game). */
  bullet: boolean;
  /** Per-side clocks, present only during and after a Bullet battle. */
  clock: Clock | null;
};

/** How long past the estimated zero to wait for a friend's own `flag` before calling it. */
export const OPPONENT_FLAG_GRACE_MS = 5_000;

export type AppAction =
  | { type: 'go-home' }
  | { type: 'play-ai' }
  | { type: 'host-room'; code: string; name: string; session: string }
  | { type: 'join-room'; code: string; name: string; session: string }
  | { type: 'select-ship'; kind: ShipKind | null }
  | { type: 'rotate' }
  | { type: 'place-at'; at: Coord }
  | { type: 'pick-up'; kind: ShipKind }
  | { type: 'randomize' }
  | { type: 'reset-fleet' }
  | { type: 'set-difficulty'; difficulty: Difficulty }
  | { type: 'set-bullet'; bullet: boolean }
  | { type: 'start' }
  | { type: 'ready' }
  | { type: 'player-fire'; at: Coord }
  | { type: 'ai-fire' }
  | { type: 'play-again' }
  | { type: 'rematch' }
  | { type: 'claim-win' }
  /** The running side's Bullet clock has hit zero. */
  | { type: 'flag' }
  | { type: 'link-status'; status: LinkStatus }
  | { type: 'link-error'; error: LinkError }
  | { type: 'grace-expired' }
  | { type: 'peer-message'; msg: NetMessage }
  | { type: 'outbox-sent'; count: number };

const PLACEMENT_HINT = 'Place your fleet. Click a ship, then click the board. Press R to rotate.';

export function initialAppState(difficulty: Difficulty = 'normal', gameId = 0): AppState {
  return {
    mode: 'home',
    game: createGame(),
    difficulty,
    ai: createAi(difficulty),
    net: null,
    selectedShip: 'carrier',
    orientation: 'horizontal',
    message: 'Choose how you want to play.',
    shotSeq: 0,
    gameId,
    bullet: false,
    clock: null,
  };
}

function freshNet(role: Role, code: string, name: string, session: string): NetState {
  return {
    role,
    code,
    myName: name,
    session,
    status: 'connecting',
    error: null,
    opponent: null,
    myReady: false,
    theirReady: false,
    gameNumber: 0,
    seq: 0,
    theirSeq: 0,
    pendingFire: null,
    lastResult: null,
    rematchMine: false,
    rematchTheirs: false,
    forfeit: false,
    outbox: [],
  };
}

/** Who fires first in the current friend game, from my point of view. */
export function firstMover(net: NetState): Player {
  const hostFirst = net.gameNumber % 2 === 0;
  return (net.role === 'host') === hostFirst ? 'player' : 'opponent';
}

export function opponentName(state: AppState): string {
  return state.mode === 'friend' ? (state.net?.opponent?.name ?? 'your friend') : 'the AI';
}

function nextUnplaced(game: GameState): ShipKind | null {
  const spec = FLEET.find((s) => !game.player.ships.some((p) => p.kind === s.kind));
  return spec?.kind ?? null;
}

export function describeShot(shot: ShotResult, enemy = 'The enemy'): string {
  const who = shot.by === 'player' ? 'You' : enemy;
  const whose = shot.by === 'player' ? 'their' : 'your';
  const where = coordLabel(shot.at);
  switch (shot.outcome) {
    case 'miss':
      return `${who} fired at ${where} — miss.`;
    case 'hit':
      return `${who} fired at ${where} — hit!`;
    case 'sunk':
      return `${who} sank ${whose} ${shipSpec(shot.sunk!).name} at ${where}!`;
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function withNet(state: AppState, net: Partial<NetState>): AppState {
  if (!state.net) return state;
  return { ...state, net: { ...state.net, ...net } };
}

function queue(net: NetState, ...msgs: NetMessage[]): NetState {
  return { ...net, outbox: [...net.outbox, ...msgs] };
}

/** My fleet, sent to the loser at game over so they can see where the ships were. */
function revealMessage(game: GameState): NetMessage {
  return { t: 'reveal', ships: game.player.ships.map(({ kind, cells }) => ({ kind, cells })) };
}

/** Both fleets are placed and locked: start the battle with the side decided by game number. */
function beginVersus(state: AppState, net: NetState): AppState {
  const first = firstMover(net);
  const name = net.opponent?.name ?? 'your friend';
  return {
    ...state,
    net,
    game: startVersus(state.game, first),
    clock: state.bullet ? createClock() : null,
    selectedShip: null,
    message:
      first === 'player'
        ? `Battle stations! You fire first — pick a cell in ${name}'s waters.`
        : `Battle stations! ${name} fires first. Brace…`,
  };
}

/** Back to placement in the same room, e.g. after a rematch or when a new opponent joins. */
function newVersusGame(state: AppState, net: NetState, message: string): AppState {
  return {
    ...state,
    net: {
      ...net,
      myReady: false,
      theirReady: false,
      seq: 0,
      theirSeq: 0,
      pendingFire: null,
      lastResult: null,
      rematchMine: false,
      rematchTheirs: false,
      forfeit: false,
    },
    game: createGame(),
    clock: null,
    selectedShip: 'carrier',
    orientation: 'horizontal',
    shotSeq: 0,
    gameId: state.gameId + 1,
    message,
  };
}

function inBattle(game: GameState): boolean {
  return game.phase === 'player-turn' || game.phase === 'opponent-turn';
}

/** Whose Bullet clock should be ticking right now: the side to move, while the link is up. */
function tickingSide(state: AppState): Player | null {
  const { game, net } = state;
  if (state.mode === 'friend' && net?.status !== 'connected') return null;
  if (game.phase === 'player-turn') return net?.pendingFire ? null : 'player';
  if (game.phase === 'opponent-turn') return 'opponent';
  return null;
}

/** Keeps the clock in step with the turn after every transition. */
function syncClock(state: AppState, now: () => number): AppState {
  const { clock } = state;
  if (!clock || clock.flagged) return state;
  const side = tickingSide(state);
  if (side === clock.running) return state;
  return { ...state, clock: runClock(clock, side, now()) };
}

/** Ends the game on the clock with `loser` out of time. */
function timeOut(state: AppState, loser: Player, now: number, announce: boolean): AppState {
  const { game } = state;
  const clock = state.clock ?? createClock();
  const won = loser === 'opponent';
  const over: GameState = { ...game, phase: 'game-over', winner: won ? 'player' : 'opponent' };
  const name = opponentName(state);
  let net: NetState | null = state.net ? { ...state.net, pendingFire: null } : null;
  if (net && state.mode === 'friend') {
    if (announce) net = queue(net, { t: 'flag', who: won ? 'you' : 'me' });
    if (won) net = queue(net, revealMessage(over));
  }
  return {
    ...state,
    game: over,
    net,
    clock: flagClock(clock, loser, now),
    message: won
      ? `${capitalize(name)} ran out of time — victory on the clock!`
      : `Out of time! ${capitalize(name)} wins on the clock.`,
  };
}

export function appReducer(
  state: AppState,
  action: AppAction,
  rng: Rng = defaultRng,
  now: () => number = Date.now,
): AppState {
  return syncClock(reduce(state, action, rng, now), now);
}

function reduce(state: AppState, action: AppAction, rng: Rng, now: () => number): AppState {
  const { game } = state;
  switch (action.type) {
    case 'go-home':
      return initialAppState(state.difficulty, state.gameId + 1);

    case 'play-ai':
      return {
        ...initialAppState(state.difficulty, state.gameId + 1),
        mode: 'ai',
        message: PLACEMENT_HINT,
      };

    case 'host-room':
    case 'join-room':
      return {
        ...initialAppState(state.difficulty, state.gameId + 1),
        mode: 'friend',
        net: freshNet(
          action.type === 'host-room' ? 'host' : 'guest',
          action.code,
          action.name,
          action.session,
        ),
        message: action.type === 'host-room' ? 'Opening your room…' : 'Connecting to your friend…',
      };

    case 'select-ship':
      return { ...state, selectedShip: action.kind };

    case 'rotate':
      return {
        ...state,
        orientation: state.orientation === 'horizontal' ? 'vertical' : 'horizontal',
      };

    case 'place-at': {
      if (game.phase !== 'placement' || state.net?.myReady) return state;
      const existing = shipAt(game.player, action.at);
      if (existing) {
        return {
          ...state,
          game: setPlayerBoard(game, removeShip(game.player, existing.kind)),
          selectedShip: existing.kind,
          orientation: shipOrientation(existing),
          message: `Picked up ${existing.name}. Click to place it again.`,
        };
      }
      if (!state.selectedShip) return { ...state, message: 'Select a ship from the tray first.' };
      const spec = shipSpec(state.selectedShip);
      if (!canPlace(game.player, spec, action.at, state.orientation)) {
        return { ...state, message: `${spec.name} can't go there — ships must not touch.` };
      }
      const board = placeShip(game.player, spec, action.at, state.orientation);
      const next = setPlayerBoard(game, board);
      const remaining = nextUnplaced(next);
      return {
        ...state,
        game: next,
        selectedShip: remaining,
        message: remaining
          ? `${spec.name} placed. Now place your ${shipSpec(remaining).name}.`
          : state.mode === 'friend'
            ? 'Fleet ready! Press Ready when you are set.'
            : 'Fleet ready! Pick a difficulty and start the battle.',
      };
    }

    case 'pick-up': {
      if (game.phase !== 'placement' || state.net?.myReady) return state;
      const ship = game.player.ships.find((s) => s.kind === action.kind);
      if (!ship) return state;
      return {
        ...state,
        game: setPlayerBoard(game, removeShip(game.player, action.kind)),
        selectedShip: action.kind,
        orientation: shipOrientation(ship),
        message: `Picked up ${ship.name}. Click to place it again.`,
      };
    }

    case 'randomize': {
      if (game.phase !== 'placement' || state.net?.myReady) return state;
      const board = randomizeFleet(createBoard(), rng);
      return {
        ...state,
        game: setPlayerBoard(game, board),
        selectedShip: null,
        message:
          state.mode === 'friend'
            ? 'Fleet randomized. Click a ship to move it, or press Ready.'
            : 'Fleet randomized. Click a ship to move it, or start the battle.',
      };
    }

    case 'reset-fleet':
      if (game.phase !== 'placement' || state.net?.myReady) return state;
      return {
        ...state,
        game: setPlayerBoard(game, createBoard()),
        selectedShip: 'carrier',
        message: 'Fleet cleared. Place your Carrier.',
      };

    case 'set-difficulty':
      if (game.phase !== 'placement') return state;
      return { ...state, difficulty: action.difficulty, ai: createAi(action.difficulty) };

    case 'set-bullet': {
      if (game.phase !== 'placement' || action.bullet === state.bullet) return state;
      const net = state.net;
      if (net && (net.role !== 'host' || net.myReady)) return state;
      const settings: NetMessage = { t: 'settings', bullet: action.bullet };
      return {
        ...state,
        bullet: action.bullet,
        net: net && net.status === 'connected' ? queue(net, settings) : net,
      };
    }

    case 'start': {
      if (state.mode !== 'ai' || game.phase !== 'placement') return state;
      try {
        return {
          ...state,
          game: startGame(game, rng),
          ai: createAi(state.difficulty),
          clock: state.bullet ? createClock() : null,
          selectedShip: null,
          message: state.bullet
            ? 'Battle stations! Your minute is ticking — fire at the enemy waters.'
            : 'Battle stations! Fire at the enemy waters.',
        };
      } catch {
        return { ...state, message: 'Place all five ships before starting.' };
      }
    }

    case 'ready': {
      const net = state.net;
      if (!net || game.phase !== 'placement' || net.myReady) return state;
      if (!isFleetComplete(game.player)) {
        return { ...state, message: 'Place all five ships before you are ready.' };
      }
      if (net.status !== 'connected') {
        return { ...state, message: 'Waiting for your friend to connect…' };
      }
      const ready = queue({ ...net, myReady: true }, { t: 'ready' });
      if (ready.theirReady) return beginVersus({ ...state, selectedShip: null }, ready);
      return {
        ...state,
        net: ready,
        selectedShip: null,
        message: `Fleet locked. Waiting for ${ready.opponent?.name ?? 'your friend'} to finish placing…`,
      };
    }

    case 'player-fire': {
      if (game.phase !== 'player-turn') return state;
      if (isShotAlready(game.opponent, action.at)) {
        return { ...state, message: `You already fired at ${coordLabel(action.at)}.` };
      }
      if (state.mode === 'friend') {
        const net = state.net;
        if (!net || net.status !== 'connected' || net.pendingFire) return state;
        const shot = { seq: net.seq, at: action.at };
        return {
          ...state,
          net: queue(
            { ...net, seq: net.seq + 1, pendingFire: shot },
            { t: 'fire', seq: shot.seq, at: shot.at },
          ),
          message: `Firing at ${coordLabel(action.at)}…`,
        };
      }
      const next = fire(game, 'player', action.at);
      const shot = next.log[next.log.length - 1];
      return {
        ...state,
        game: next,
        shotSeq: state.shotSeq + 1,
        message:
          next.phase === 'game-over'
            ? 'Victory! You sank the entire enemy fleet.'
            : describeShot(shot),
      };
    }

    case 'ai-fire': {
      if (state.mode !== 'ai' || game.phase !== 'opponent-turn') return state;
      const at = chooseShot(state.ai, rng);
      const next = fire(game, 'opponent', at);
      const shot = next.log[next.log.length - 1];
      const ai = observe(state.ai, { at, outcome: shot.outcome, sunk: shot.sunk });
      return {
        ...state,
        game: next,
        ai,
        shotSeq: state.shotSeq + 1,
        message:
          next.phase === 'game-over' ? 'Defeat. Your fleet has been sunk.' : describeShot(shot),
      };
    }

    case 'play-again':
      if (state.mode !== 'ai') return state;
      return {
        ...initialAppState(state.difficulty, state.gameId + 1),
        mode: 'ai',
        bullet: state.bullet,
        message: PLACEMENT_HINT,
      };

    case 'rematch': {
      const net = state.net;
      if (!net || game.phase !== 'game-over' || net.status !== 'connected' || net.rematchMine) {
        return state;
      }
      const asked = queue({ ...net, rematchMine: true }, { t: 'rematch' });
      const name = asked.opponent?.name ?? 'your friend';
      if (asked.rematchTheirs) {
        const next = { ...asked, gameNumber: asked.gameNumber + 1 };
        return newVersusGame(state, next, rematchHint(next));
      }
      return { ...state, net: asked, message: `Rematch requested — waiting for ${name}…` };
    }

    case 'claim-win': {
      const net = state.net;
      if (!net || !inBattle(game) || (net.status !== 'lost' && net.status !== 'left')) return state;
      return {
        ...state,
        net: { ...net, forfeit: true, pendingFire: null },
        game: { ...game, phase: 'game-over', winner: 'player' },
        message: `${net.opponent?.name ?? 'Your friend'} left the game. Victory by forfeit.`,
      };
    }

    case 'flag': {
      const clock = state.clock;
      if (!clock || !clock.running || !inBattle(game)) return state;
      const at = now();
      if (remaining(clock, clock.running, at) > 0) return state;
      return timeOut(state, clock.running, at, true);
    }

    case 'link-status':
      return applyLinkStatus(state, action.status);

    case 'link-error':
      return applyLinkError(state, action.error);

    case 'grace-expired': {
      const net = state.net;
      if (!net || !net.opponent || (net.status !== 'reconnecting' && net.status !== 'handshake')) {
        return state;
      }
      const gone = `${net.opponent.name} did not come back.`;
      if (game.phase === 'placement') return reopenRoom(state, net, gone);
      // Nothing to forfeit once the game is over; they are simply gone.
      return withNet({ ...state, message: gone }, { status: inBattle(game) ? 'lost' : 'left' });
    }

    case 'peer-message':
      return state.net ? applyPeerMessage(state, state.net, action.msg, now) : state;

    case 'outbox-sent':
      return withNet(state, { outbox: state.net?.outbox.slice(action.count) ?? [] });
  }
}

/**
 * The opponent is gone before the battle started. Nothing has been exchanged yet, so the host
 * simply waits for the next guest; the guest's room no longer exists.
 */
function reopenRoom(state: AppState, net: NetState, why: string): AppState {
  if (net.role === 'guest') {
    return withNet({ ...state, message: why }, { status: 'left', outbox: [] });
  }
  return {
    ...state,
    net: {
      ...net,
      status: 'waiting',
      opponent: null,
      myReady: false,
      theirReady: false,
      outbox: [],
    },
    selectedShip: isFleetComplete(state.game.player) ? null : nextUnplaced(state.game),
    message: `${why} Your room is still open — share the code again.`,
  };
}

function rematchHint(net: NetState): string {
  const first = firstMover(net);
  const name = net.opponent?.name ?? 'your friend';
  return first === 'player'
    ? `Rematch! Place your fleet — you fire first this time.`
    : `Rematch! Place your fleet — ${name} fires first this time.`;
}

function applyLinkStatus(state: AppState, status: LinkStatus): AppState {
  const net = state.net;
  if (!net || net.status === 'error') return state;
  switch (status) {
    case 'registering':
    case 'dialing':
    case 'broker-lost':
      return state;
    case 'waiting':
      if (net.status !== 'connecting') return state;
      return withNet(
        { ...state, message: 'Room open. Share the code, then place your fleet while you wait.' },
        { status: 'waiting' },
      );
    case 'channel-open': {
      const hello: NetMessage = {
        t: 'hello',
        v: PROTOCOL_VERSION,
        name: net.myName,
        session: net.session,
      };
      const status = net.status === 'connected' ? 'connected' : 'handshake';
      return withNet(state, queue({ ...net, status }, hello));
    }
    case 'channel-closed': {
      if (net.status === 'lost' || net.status === 'left') return state;
      if (!net.opponent) {
        return withNet(state, {
          status: net.role === 'host' ? 'waiting' : 'connecting',
          outbox: [],
        });
      }
      return withNet(
        { ...state, message: `Connection lost. Reconnecting to ${net.opponent.name}…` },
        { status: 'reconnecting', outbox: [] },
      );
    }
  }
}

function applyLinkError(state: AppState, error: LinkError): AppState {
  const net = state.net;
  if (!net || net.status === 'error') return state;
  // While reconnecting, transient failures are expected; the grace timer decides the outcome.
  if (net.status === 'reconnecting' && error.kind !== 'unsupported') return state;
  if (net.status === 'lost' || net.status === 'left') return state;
  if (error.kind === 'webrtc') {
    // A failed negotiation only concerns that one attempt. With an opponent seated, the channel
    // close that follows starts the reconnect grace; a host still waiting just keeps the room.
    if (net.opponent) return state;
    if (net.role === 'host') {
      return withNet(
        {
          ...state,
          message:
            'A friend tried to join but the browsers could not connect directly. Your room is still open — ask them to try again.',
        },
        { status: 'waiting', outbox: [] },
      );
    }
  }
  const text: Record<LinkError['kind'], string> = {
    'room-taken': 'That room code is already in use. Try a new code.',
    'room-not-found': `No open game found for code ${net.code}. Check the code or ask your friend to re-host.`,
    'room-full': `Room ${net.code} already has two players. Ask your friend for a new code.`,
    network: 'Could not reach the matchmaking server. Check your connection and try again.',
    webrtc:
      'Could not open a direct connection between your browsers — a strict network, VPN or mobile carrier may be blocking it. Try again, or try another network.',
    unsupported: 'This browser does not support the connections needed to play a friend.',
    unknown: `Connection failed: ${error.message}`,
  };
  return withNet(
    { ...state, message: text[error.kind] },
    { status: 'error', error: text[error.kind] },
  );
}

/** The host tells a (new or returning) guest which settings the room is using. */
function withSettings(state: AppState, net: NetState): NetState {
  if (net.role !== 'host' || state.game.phase !== 'placement') return net;
  return queue(net, { t: 'settings', bullet: state.bullet });
}

function applyPeerMessage(
  state: AppState,
  net: NetState,
  msg: NetMessage,
  now: () => number,
): AppState {
  const { game } = state;
  switch (msg.t) {
    case 'hello': {
      if (msg.v !== PROTOCOL_VERSION) {
        const text =
          'Your friend is running a different version of the game — both of you refresh and try again.';
        return withNet({ ...state, message: text }, { status: 'error', error: text });
      }
      const resumed = net.opponent?.session === msg.session;
      const opponent = { name: msg.name, session: msg.session };
      if (resumed) {
        // Same tab came back: re-send anything they may have missed while the channel was down.
        let next: NetState = withSettings(state, { ...net, status: 'connected', opponent });
        if (next.pendingFire) {
          next = queue(next, { t: 'fire', seq: next.pendingFire.seq, at: next.pendingFire.at });
        }
        if (game.phase === 'placement' && next.myReady) next = queue(next, { t: 'ready' });
        // We may have taken the win while they were away; they still think the battle is on.
        const claimed = game.phase === 'game-over' && next.forfeit && game.winner === 'player';
        if (claimed) next = queue(next, { t: 'forfeit' });
        const flagged = game.phase === 'game-over' ? state.clock?.flagged : null;
        if (flagged) next = queue(next, { t: 'flag', who: flagged === 'player' ? 'me' : 'you' });
        if (game.phase === 'game-over' && game.winner === 'player') {
          next = queue(next, revealMessage(game));
        }
        if (game.phase === 'game-over' && next.rematchMine) next = queue(next, { t: 'rematch' });
        return {
          ...state,
          net: next,
          message: claimed
            ? `${msg.name} is back, but the game already ended by forfeit.`
            : `${msg.name} is back. Carry on!`,
        };
      }
      if (net.opponent && inBattle(game)) {
        // A different session mid-game means they reloaded and lost their board.
        return withNet(
          { ...state, message: `${net.opponent.name} left the game (their page was reloaded).` },
          { status: 'left' },
        );
      }
      // Before the battle nothing has been exchanged: whoever this is, both sides ready up afresh.
      const joined: NetState = {
        ...net,
        status: 'connected',
        opponent,
        myReady: false,
        theirReady: false,
        rematchMine: false,
        rematchTheirs: false,
      };
      if (game.phase === 'game-over') {
        const fresh = newVersusGame(
          state,
          joined,
          `${msg.name} joined. Place your fleet, then press Ready.`,
        );
        return fresh.net ? { ...fresh, net: withSettings(fresh, fresh.net) } : fresh;
      }
      return {
        ...state,
        net: withSettings(state, joined),
        selectedShip: isFleetComplete(game.player) ? null : nextUnplaced(game),
        message: `${msg.name} joined! Place your fleet, then press Ready.`,
      };
    }

    case 'settings': {
      if (net.role !== 'guest' || game.phase !== 'placement' || net.status !== 'connected') {
        return state;
      }
      if (msg.bullet === state.bullet) return state;
      const host = net.opponent?.name ?? 'The host';
      return {
        ...state,
        bullet: msg.bullet,
        message: msg.bullet
          ? `${host} switched on Bullet: one minute each for the whole game.`
          : `${host} switched Bullet off — no clocks this game.`,
      };
    }

    case 'flag': {
      if (net.status !== 'connected' || !inBattle(game)) return state;
      return timeOut(state, msg.who === 'me' ? 'opponent' : 'player', now(), false);
    }

    case 'ready': {
      if (net.status !== 'connected' || game.phase !== 'placement' || net.theirReady) return state;
      const both = { ...net, theirReady: true };
      if (both.myReady) return beginVersus(state, both);
      return {
        ...state,
        net: both,
        message: `${both.opponent?.name ?? 'Your friend'} is ready. Finish placing and press Ready.`,
      };
    }

    case 'fire': {
      if (net.status !== 'connected') return state;
      // Duplicate of the last answered shot (they re-sent it after a reconnect): repeat our answer.
      if (msg.seq === net.theirSeq - 1 && net.lastResult && sameCoord(net.lastResult.at, msg.at)) {
        return withNet(state, queue(net, net.lastResult));
      }
      if (game.phase !== 'opponent-turn' || msg.seq !== net.theirSeq) return state;
      if (isShotAlready(game.player, msg.at)) return state;
      const next = fire(game, 'opponent', msg.at);
      const shot = next.log[next.log.length - 1];
      const sunkShip = shot.sunk ? game.player.ships.find((s) => s.kind === shot.sunk) : undefined;
      const result: ResultMessage = {
        t: 'result',
        seq: msg.seq,
        at: msg.at,
        outcome: shot.outcome,
        gameOver: next.phase === 'game-over',
        ...(sunkShip ? { sunk: { kind: sunkShip.kind, cells: sunkShip.cells } } : {}),
      };
      const name = net.opponent?.name ?? 'Your friend';
      return {
        ...state,
        game: next,
        net: queue({ ...net, theirSeq: net.theirSeq + 1, lastResult: result }, result),
        shotSeq: state.shotSeq + 1,
        message:
          next.phase === 'game-over'
            ? `Defeat. ${name} sank your fleet.`
            : `${describeShot(shot, name)} Your turn.`,
      };
    }

    case 'result': {
      const pending = net.pendingFire;
      if (net.status !== 'connected' || !pending) return state;
      if (msg.seq !== pending.seq || !sameCoord(msg.at, pending.at)) return state;
      if (game.phase !== 'player-turn') return state;
      let next: GameState;
      try {
        next = applyShotResult(game, msg.at, msg.outcome, msg.sunk, msg.gameOver);
      } catch {
        return state;
      }
      const shot = next.log[next.log.length - 1];
      const name = net.opponent?.name ?? 'your friend';
      const won = next.phase === 'game-over';
      const settled: NetState = { ...net, pendingFire: null };
      return {
        ...state,
        game: next,
        net: won ? queue(settled, revealMessage(next)) : settled,
        shotSeq: state.shotSeq + 1,
        message: won
          ? `Victory! You sank ${name}'s entire fleet.`
          : `${describeShot(shot)} ${capitalize(name)}'s turn.`,
      };
    }

    case 'reveal': {
      if (game.phase !== 'game-over' || game.winner !== 'opponent') return state;
      if (isFleetComplete(game.opponent)) return state;
      try {
        return { ...state, game: { ...game, opponent: revealFleet(game.opponent, msg.ships) } };
      } catch {
        return state;
      }
    }

    case 'rematch': {
      if (net.status !== 'connected' || game.phase !== 'game-over' || net.rematchTheirs)
        return state;
      const asked = { ...net, rematchTheirs: true };
      const name = asked.opponent?.name ?? 'Your friend';
      if (asked.rematchMine) {
        const next = { ...asked, gameNumber: asked.gameNumber + 1 };
        return newVersusGame(state, next, rematchHint(next));
      }
      return { ...state, net: asked, message: `${name} wants a rematch!` };
    }

    case 'forfeit': {
      if (net.status !== 'connected' || !inBattle(game)) return state;
      const name = net.opponent?.name ?? 'Your friend';
      return {
        ...state,
        net: { ...net, forfeit: true, pendingFire: null },
        game: { ...game, phase: 'game-over', winner: 'opponent' },
        message: `You were away too long — ${name} claimed the win by forfeit.`,
      };
    }

    case 'leave': {
      if (net.status === 'left' || net.status === 'lost') return state;
      const why = `${net.opponent?.name ?? 'Your friend'} left the game.`;
      if (game.phase === 'placement') return reopenRoom(state, net, why);
      return withNet({ ...state, message: why }, { status: 'left', outbox: [] });
    }
  }
}
