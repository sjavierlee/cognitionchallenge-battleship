import { describe, expect, it } from 'vitest';
import { isFleetComplete } from '../engine/board';
import { BULLET_MS, remaining } from '../engine/clock';
import { seededRng } from '../engine/rng';
import type { Coord } from '../engine/types';
import { PROTOCOL_VERSION, type NetMessage } from '../net/protocol';
import { appReducer, initialAppState, type AppAction, type AppState } from './appState';

/** A single AI-mode reducer driven with a controllable wall clock. */
class Solo {
  state = appReducer(initialAppState(), { type: 'play-ai' });
  t = 1_000_000;
  private rng = seededRng(5);

  do(action: AppAction, advanceMs = 0) {
    this.t += advanceMs;
    this.state = appReducer(this.state, action, this.rng, () => this.t);
    return this.state;
  }

  left(side: 'player' | 'opponent') {
    const { clock } = this.state;
    if (!clock) throw new Error('no clock');
    return remaining(clock, side, this.t);
  }
}

function nextUnshot(s: AppState): Coord {
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 10; col++) {
      const c = s.game.opponent.cells[row][col];
      if (c === 'empty' || c === 'ship') return { row, col };
    }
  }
  throw new Error('board exhausted');
}

/** Two friend-mode reducers joined in memory, sharing one controllable wall clock. */
class Table {
  host: AppState;
  guest: AppState;
  t = 5_000_000;
  offline = false;
  private rngH = seededRng(11);
  private rngG = seededRng(22);

  constructor() {
    this.host = appReducer(initialAppState(), {
      type: 'host-room',
      code: 'K7Q2ZD',
      name: 'Ada',
      session: 'sess-host',
    });
    this.guest = appReducer(initialAppState(), {
      type: 'join-room',
      code: 'K7Q2ZD',
      name: 'Bob',
      session: 'sess-guest',
    });
  }

  private now = () => this.t;

  h(action: AppAction, advanceMs = 0) {
    this.t += advanceMs;
    this.host = appReducer(this.host, action, this.rngH, this.now);
    this.pump();
  }

  g(action: AppAction, advanceMs = 0) {
    this.t += advanceMs;
    this.guest = appReducer(this.guest, action, this.rngG, this.now);
    this.pump();
  }

  pump() {
    for (let i = 0; i < 20; i++) {
      const fromHost = this.host.net?.outbox ?? [];
      const fromGuest = this.guest.net?.outbox ?? [];
      if (fromHost.length === 0 && fromGuest.length === 0) return;
      this.host = appReducer(this.host, { type: 'outbox-sent', count: fromHost.length });
      this.guest = appReducer(this.guest, { type: 'outbox-sent', count: fromGuest.length });
      if (this.offline) continue;
      for (const msg of fromHost) {
        this.guest = appReducer(this.guest, { type: 'peer-message', msg }, this.rngG, this.now);
      }
      for (const msg of fromGuest) {
        this.host = appReducer(this.host, { type: 'peer-message', msg }, this.rngH, this.now);
      }
    }
    throw new Error('message storm');
  }

  /** Delivers one message to a side as if it came over the wire. */
  deliver(to: 'host' | 'guest', msg: NetMessage) {
    if (to === 'host') this.h({ type: 'peer-message', msg });
    else this.g({ type: 'peer-message', msg });
  }

  connect() {
    this.h({ type: 'link-status', status: 'waiting' });
    this.h({ type: 'link-status', status: 'channel-open' });
    this.g({ type: 'link-status', status: 'channel-open' });
  }

  startBattle() {
    this.h({ type: 'randomize' });
    this.g({ type: 'randomize' });
    this.h({ type: 'ready' });
    this.g({ type: 'ready' });
    expect(this.host.game.phase).toBe('player-turn');
    expect(this.guest.game.phase).toBe('opponent-turn');
  }

  left(side: 'host' | 'guest', who: 'player' | 'opponent') {
    const clock = (side === 'host' ? this.host : this.guest).clock;
    if (!clock) throw new Error(`${side} has no clock`);
    return remaining(clock, who, this.t);
  }
}

describe('Bullet vs the AI', () => {
  it('is off by default and only creates clocks when switched on before the battle', () => {
    const s = new Solo();
    expect(s.state.bullet).toBe(false);
    s.do({ type: 'randomize' });
    s.do({ type: 'start' });
    expect(s.state.clock).toBeNull();
    // Nothing to flag in a standard game.
    expect(s.do({ type: 'flag' }, 120_000)).toBe(s.state);
    expect(s.state.game.phase).toBe('player-turn');
  });

  it('runs the clock of the side to move and banks time at each turn change', () => {
    const s = new Solo();
    s.do({ type: 'set-bullet', bullet: true });
    s.do({ type: 'randomize' });
    s.do({ type: 'start' });
    expect(s.state.clock?.running).toBe('player');
    expect(s.state.message).toMatch(/minute is ticking/);
    expect(s.left('player')).toBe(BULLET_MS);

    s.do({ type: 'player-fire', at: nextUnshot(s.state) }, 4_000);
    expect(s.state.clock?.running).toBe('opponent');
    expect(s.left('player')).toBe(BULLET_MS - 4_000);
    expect(s.left('opponent')).toBe(BULLET_MS);

    s.do({ type: 'ai-fire' }, 400);
    expect(s.state.clock?.running).toBe('player');
    expect(s.left('opponent')).toBe(BULLET_MS - 400);
    // A refused shot (same cell twice) does not touch the clock.
    const at = s.state.game.log[0].at;
    s.do({ type: 'player-fire', at }, 1_000);
    expect(s.state.clock?.running).toBe('player');
    expect(s.left('player')).toBe(BULLET_MS - 5_000);
  });

  it('cannot be toggled once the battle is under way', () => {
    const s = new Solo();
    s.do({ type: 'randomize' });
    s.do({ type: 'start' });
    expect(s.do({ type: 'set-bullet', bullet: true })).toBe(s.state);
    expect(s.state.bullet).toBe(false);
    expect(s.state.clock).toBeNull();
  });

  it('ignores a flag while time remains, then loses on time once it runs out', () => {
    const s = new Solo();
    s.do({ type: 'set-bullet', bullet: true });
    s.do({ type: 'randomize' });
    s.do({ type: 'start' });

    const before = s.do({ type: 'flag' }, BULLET_MS - 1);
    expect(before.game.phase).toBe('player-turn');
    expect(before.clock?.flagged).toBeNull();

    s.do({ type: 'flag' }, 1);
    expect(s.state.game.phase).toBe('game-over');
    expect(s.state.game.winner).toBe('opponent');
    expect(s.state.clock?.flagged).toBe('player');
    expect(s.state.clock?.running).toBeNull();
    expect(s.left('player')).toBe(0);
    expect(s.left('opponent')).toBe(BULLET_MS);
    expect(s.state.message).toMatch(/out of time/i);

    // Nothing moves after the flag: no more shots, no second flag, clock stays put.
    const over = s.state;
    expect(s.do({ type: 'player-fire', at: nextUnshot(over) }, 5_000)).toBe(over);
    expect(s.do({ type: 'ai-fire' }, 5_000)).toBe(over);
    expect(s.do({ type: 'flag' }, 5_000)).toBe(over);
  });

  it('lets the AI lose on time too', () => {
    const s = new Solo();
    s.do({ type: 'set-bullet', bullet: true });
    s.do({ type: 'randomize' });
    s.do({ type: 'start' });
    s.do({ type: 'player-fire', at: nextUnshot(s.state) }, 2_000);
    expect(s.state.clock?.running).toBe('opponent');

    s.do({ type: 'flag' }, BULLET_MS + 1);
    expect(s.state.game.phase).toBe('game-over');
    expect(s.state.game.winner).toBe('player');
    expect(s.state.clock?.flagged).toBe('opponent');
    expect(s.state.message).toMatch(/victory on the clock/i);
  });

  it('Play again keeps Bullet on with fresh clocks; Back to home switches it off', () => {
    const s = new Solo();
    s.do({ type: 'set-bullet', bullet: true });
    s.do({ type: 'randomize' });
    s.do({ type: 'start' });
    s.do({ type: 'flag' }, BULLET_MS);
    expect(s.state.game.phase).toBe('game-over');

    s.do({ type: 'play-again' });
    expect(s.state.bullet).toBe(true);
    expect(s.state.clock).toBeNull();
    expect(s.state.game.phase).toBe('placement');
    s.do({ type: 'randomize' });
    s.do({ type: 'start' }, 10_000);
    expect(s.left('player')).toBe(BULLET_MS);
    expect(s.left('opponent')).toBe(BULLET_MS);
    // The old game's expiry does not carry over.
    expect(s.do({ type: 'flag' }, 1_000).game.phase).toBe('player-turn');

    s.do({ type: 'go-home' });
    expect(s.state.bullet).toBe(false);
    expect(s.state.clock).toBeNull();
  });
});

describe('Bullet with a friend', () => {
  it('the host picks Bullet before anyone joins and the guest inherits it on hello', () => {
    const t = new Table();
    t.h({ type: 'set-bullet', bullet: true });
    expect(t.host.bullet).toBe(true);
    expect(t.guest.bullet).toBe(false);

    t.connect();
    expect(t.guest.bullet).toBe(true);
    expect(t.host.message).toMatch(/Bob joined/);
  });

  it('syncs later host changes and refuses changes from the guest or a ready host', () => {
    const t = new Table();
    t.connect();
    t.h({ type: 'set-bullet', bullet: true });
    expect(t.guest.bullet).toBe(true);
    expect(t.guest.message).toMatch(/Ada switched on Bullet/);

    // The guest has no say.
    const guestBefore = t.guest;
    t.g({ type: 'set-bullet', bullet: false });
    expect(t.guest).toBe(guestBefore);
    expect(t.host.bullet).toBe(true);

    t.h({ type: 'set-bullet', bullet: false });
    expect(t.guest.bullet).toBe(false);
    expect(t.guest.message).toMatch(/switched Bullet off/);

    // Ready locks the setting along with the fleet.
    t.h({ type: 'randomize' });
    t.h({ type: 'ready' });
    const hostBefore = t.host;
    t.h({ type: 'set-bullet', bullet: true });
    expect(t.host).toBe(hostBefore);
    expect(t.guest.bullet).toBe(false);
  });

  it('a guest cannot smuggle in settings of its own', () => {
    const t = new Table();
    t.connect();
    const before = t.host;
    t.deliver('host', { t: 'settings', bullet: true });
    expect(t.host).toBe(before);
    expect(t.host.bullet).toBe(false);
  });

  it('starts both clocks at the bell, running for whoever fires first on each screen', () => {
    const t = new Table();
    t.h({ type: 'set-bullet', bullet: true });
    t.connect();
    t.startBattle();

    expect(t.host.clock?.running).toBe('player');
    expect(t.guest.clock?.running).toBe('opponent');
    expect(t.left('host', 'player')).toBe(BULLET_MS);
    expect(t.left('guest', 'opponent')).toBe(BULLET_MS);

    // Host fires after 3 s: the host's own clock pauses while the shot is in flight, and on
    // both screens the guest's clock is now the one running.
    t.h({ type: 'player-fire', at: nextUnshot(t.host) }, 3_000);
    expect(t.host.game.phase).toBe('opponent-turn');
    expect(t.host.clock?.running).toBe('opponent');
    expect(t.guest.clock?.running).toBe('player');
    expect(t.left('host', 'player')).toBe(BULLET_MS - 3_000);
    expect(t.left('guest', 'opponent')).toBe(BULLET_MS - 3_000);

    t.g({ type: 'player-fire', at: nextUnshot(t.guest) }, 2_000);
    expect(t.host.clock?.running).toBe('player');
    expect(t.guest.clock?.running).toBe('opponent');
    expect(t.left('guest', 'player')).toBe(BULLET_MS - 2_000);
    expect(t.left('host', 'opponent')).toBe(BULLET_MS - 2_000);
  });

  it('a standard friend game has no clocks and ignores stray flags', () => {
    const t = new Table();
    t.connect();
    t.startBattle();
    expect(t.host.clock).toBeNull();
    expect(t.guest.clock).toBeNull();
    const before = t.host;
    t.h({ type: 'flag' }, 120_000);
    expect(t.host).toBe(before);
  });

  it('a player who runs out of time loses on both screens and sees the winner fleet', () => {
    const t = new Table();
    t.h({ type: 'set-bullet', bullet: true });
    t.connect();
    t.startBattle();

    // Host dawdles past the minute: their own screen flags first.
    t.h({ type: 'flag' }, BULLET_MS - 10);
    expect(t.host.game.phase).toBe('player-turn');
    t.h({ type: 'flag' }, 10);
    expect(t.host.game.phase).toBe('game-over');
    expect(t.host.game.winner).toBe('opponent');
    expect(t.host.clock?.flagged).toBe('player');
    expect(t.host.message).toMatch(/Out of time! Bob wins on the clock/);

    // The guest was told: they win, their clock stops, and the host's fleet is revealed to them.
    expect(t.guest.game.phase).toBe('game-over');
    expect(t.guest.game.winner).toBe('player');
    expect(t.guest.clock?.flagged).toBe('opponent');
    expect(t.guest.clock?.running).toBeNull();
    expect(t.guest.message).toMatch(/Ada ran out of time — victory on the clock/);
    expect(isFleetComplete(t.host.game.opponent)).toBe(true);
    const byKind = (s: AppState['game']['player']) =>
      [...s.ships].sort((a, b) => a.kind.localeCompare(b.kind)).map((x) => x.cells);
    expect(byKind(t.host.game.opponent)).toEqual(byKind(t.guest.game.player));

    // The guest's own (grace-delayed) flag for the host arrives late and changes nothing.
    const hostOver = t.host;
    const guestOver = t.guest;
    t.g({ type: 'flag' }, 6_000);
    expect(t.guest).toBe(guestOver);
    expect(t.host).toBe(hostOver);
    // A late duplicate flag over the wire is ignored too.
    t.deliver('host', { t: 'flag', who: 'you' });
    t.deliver('guest', { t: 'flag', who: 'me' });
    expect(t.host).toBe(hostOver);
    expect(t.guest).toBe(guestOver);
  });

  it('the waiting side can call the flag when the mover goes quiet past the minute', () => {
    const t = new Table();
    t.h({ type: 'set-bullet', bullet: true });
    t.connect();
    t.startBattle();
    t.h({ type: 'player-fire', at: nextUnshot(t.host) }, 1_000);
    expect(t.host.clock?.running).toBe('opponent');

    // The guest's screen never flags (e.g. it froze); the host calls it after the grace window.
    t.h({ type: 'flag' }, BULLET_MS + 5_000);
    expect(t.host.game.phase).toBe('game-over');
    expect(t.host.game.winner).toBe('player');
    expect(t.host.clock?.flagged).toBe('opponent');

    expect(t.guest.game.phase).toBe('game-over');
    expect(t.guest.game.winner).toBe('opponent');
    expect(t.guest.clock?.flagged).toBe('player');
    expect(t.guest.message).toMatch(/Out of time! Ada wins on the clock/);
    expect(isFleetComplete(t.guest.game.opponent)).toBe(true);
  });

  it('records nothing twice: a flag after a fleet-destruction win is ignored', () => {
    const t = new Table();
    t.h({ type: 'set-bullet', bullet: true });
    t.connect();
    t.startBattle();
    // Host sinks the whole guest fleet, one quick shot per turn; the guest fires back at random.
    for (const ship of t.guest.game.player.ships) {
      for (const at of ship.cells) {
        t.h({ type: 'player-fire', at }, 200);
        if (t.host.game.phase === 'opponent-turn') {
          t.g({ type: 'player-fire', at: nextUnshot(t.guest) }, 200);
        }
      }
    }
    expect(t.host.game.phase).toBe('game-over');
    expect(t.host.game.winner).toBe('player');
    expect(t.guest.game.winner).toBe('opponent');
    expect(t.host.clock?.running).toBeNull();
    expect(t.host.clock?.flagged).toBeNull();

    // Stray flags for a game both sides see as finished change nothing.
    const hostOver = t.host;
    const guestOver = t.guest;
    t.deliver('host', { t: 'flag', who: 'you' });
    t.deliver('guest', { t: 'flag', who: 'me' });
    t.h({ type: 'flag' }, BULLET_MS);
    expect(t.host).toBe(hostOver);
    expect(t.guest).toBe(guestOver);
  });

  it('rematch keeps the setting, drops the old clocks and starts a fresh minute', () => {
    const t = new Table();
    t.h({ type: 'set-bullet', bullet: true });
    t.connect();
    t.startBattle();
    t.h({ type: 'flag' }, BULLET_MS);
    expect(t.host.game.phase).toBe('game-over');

    t.h({ type: 'rematch' });
    t.g({ type: 'rematch' });
    expect(t.host.game.phase).toBe('placement');
    expect(t.host.clock).toBeNull();
    expect(t.guest.clock).toBeNull();
    expect(t.host.bullet).toBe(true);
    expect(t.guest.bullet).toBe(true);

    // The host may still change their mind in the rematch lobby.
    t.h({ type: 'set-bullet', bullet: false });
    expect(t.guest.bullet).toBe(false);
    t.h({ type: 'set-bullet', bullet: true });
    expect(t.guest.bullet).toBe(true);

    t.h({ type: 'randomize' });
    t.g({ type: 'randomize' });
    t.h({ type: 'ready' });
    t.g({ type: 'ready' }, 30_000);
    // Guest fires first in game two.
    expect(t.guest.game.phase).toBe('player-turn');
    expect(t.guest.clock?.running).toBe('player');
    expect(t.host.clock?.running).toBe('opponent');
    for (const side of ['host', 'guest'] as const) {
      expect(t.left(side, 'player')).toBe(BULLET_MS);
      expect(t.left(side, 'opponent')).toBe(BULLET_MS);
    }
  });

  it('pauses the clocks while the link is down and resends the setting to a returning guest', () => {
    const t = new Table();
    t.h({ type: 'set-bullet', bullet: true });
    t.connect();

    // Guest's connection blips during placement: on return the host repeats the room settings.
    t.g({ type: 'link-status', status: 'channel-closed' });
    t.h({ type: 'link-status', status: 'channel-closed' });
    t.guest = { ...t.guest, bullet: false }; // pretend the guest never got it
    t.h({ type: 'link-status', status: 'channel-open' });
    t.g({ type: 'link-status', status: 'channel-open' });
    expect(t.host.net?.status).toBe('connected');
    expect(t.guest.bullet).toBe(true);

    t.startBattle();
    t.h({ type: 'player-fire', at: nextUnshot(t.host) }, 5_000);
    expect(t.host.clock?.running).toBe('opponent');
    expect(t.guest.clock?.running).toBe('player');

    // Link drops mid-turn: neither side charges anyone while reconnecting.
    t.h({ type: 'link-status', status: 'channel-closed' }, 2_000);
    t.g({ type: 'link-status', status: 'channel-closed' });
    expect(t.host.clock?.running).toBeNull();
    expect(t.guest.clock?.running).toBeNull();
    expect(t.left('host', 'opponent')).toBe(BULLET_MS - 2_000);
    expect(t.left('guest', 'player')).toBe(BULLET_MS - 2_000);
    // Time passes offline; nobody is charged and nobody can be flagged.
    const hostPaused = t.host;
    t.h({ type: 'flag' }, BULLET_MS);
    expect(t.host).toBe(hostPaused);

    // Back online: the guest's clock resumes where it left off, on both screens.
    t.h({ type: 'link-status', status: 'channel-open' });
    t.g({ type: 'link-status', status: 'channel-open' });
    expect(t.host.net?.status).toBe('connected');
    expect(t.guest.net?.status).toBe('connected');
    expect(t.host.game.phase).toBe('opponent-turn');
    expect(t.host.clock?.running).toBe('opponent');
    expect(t.guest.clock?.running).toBe('player');
    expect(t.left('host', 'opponent')).toBe(BULLET_MS - 2_000);
    expect(t.left('guest', 'player')).toBe(BULLET_MS - 2_000);
  });

  it('a returning opponent learns they lost on time while away', () => {
    const t = new Table();
    t.h({ type: 'set-bullet', bullet: true });
    t.connect();
    t.startBattle();
    t.h({ type: 'player-fire', at: nextUnshot(t.host) }, 1_000);

    // Guest freezes but the link stays up; host flags them after the grace window. The flag is
    // lost on the wire (guest tab was hung), so the guest still thinks it is their move.
    t.offline = true;
    t.h({ type: 'flag' }, BULLET_MS + 5_000);
    expect(t.host.game.phase).toBe('game-over');
    expect(t.guest.game.phase).toBe('player-turn');
    t.offline = false;

    // The channel bounces; on the resumed hello the host re-sends the flag and its fleet.
    t.h({ type: 'link-status', status: 'channel-closed' });
    t.g({ type: 'link-status', status: 'channel-closed' });
    t.h({ type: 'link-status', status: 'channel-open' });
    t.g({ type: 'link-status', status: 'channel-open' });
    expect(t.guest.game.phase).toBe('game-over');
    expect(t.guest.game.winner).toBe('opponent');
    expect(t.guest.clock?.flagged).toBe('player');
    expect(isFleetComplete(t.guest.game.opponent)).toBe(true);
  });

  it('speaks protocol v2 so older clients are told to refresh', () => {
    const t = new Table();
    t.connect();
    expect(PROTOCOL_VERSION).toBe(2);
    t.deliver('host', { t: 'hello', v: 1, name: 'Old', session: 'old' });
    expect(t.host.net?.status).toBe('error');
  });
});
