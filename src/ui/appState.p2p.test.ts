import { describe, expect, it } from 'vitest';
import { seededRng } from '../engine/rng';
import type { Coord } from '../engine/types';
import type { NetMessage } from '../net/protocol';
import { appReducer, firstMover, initialAppState, type AppAction, type AppState } from './appState';

/** Two reducers joined by an in-memory channel that delivers each side's outbox to the other. */
class Table {
  host: AppState;
  guest: AppState;
  /** Messages in flight; `pump()` delivers them. Set `offline` to drop everything sent. */
  offline = false;
  dropped: NetMessage[] = [];
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

  h(action: AppAction) {
    this.host = appReducer(this.host, action, this.rngH);
    this.pump();
  }

  g(action: AppAction) {
    this.guest = appReducer(this.guest, action, this.rngG);
    this.pump();
  }

  /** Repeatedly moves outbox messages across until both sides are quiet. */
  pump() {
    for (let i = 0; i < 20; i++) {
      const fromHost = this.host.net?.outbox ?? [];
      const fromGuest = this.guest.net?.outbox ?? [];
      if (fromHost.length === 0 && fromGuest.length === 0) return;
      this.host = appReducer(this.host, { type: 'outbox-sent', count: fromHost.length });
      this.guest = appReducer(this.guest, { type: 'outbox-sent', count: fromGuest.length });
      if (this.offline) {
        this.dropped.push(...fromHost, ...fromGuest);
        continue;
      }
      for (const msg of fromHost)
        this.guest = appReducer(this.guest, { type: 'peer-message', msg });
      for (const msg of fromGuest) this.host = appReducer(this.host, { type: 'peer-message', msg });
    }
    throw new Error('message storm');
  }

  connect() {
    this.h({ type: 'link-status', status: 'waiting' });
    this.h({ type: 'link-status', status: 'channel-open' });
    this.g({ type: 'link-status', status: 'channel-open' });
  }

  placeBoth() {
    this.h({ type: 'randomize' });
    this.g({ type: 'randomize' });
  }

  readyBoth() {
    this.h({ type: 'ready' });
    this.g({ type: 'ready' });
  }

  /** Runs a full game where the side to move always fires at the next unshot cell. */
  playToEnd() {
    let guard = 0;
    while (this.host.game.phase !== 'game-over' && guard++ < 200) {
      const shooter = this.host.game.phase === 'player-turn' ? 'host' : 'guest';
      const s = shooter === 'host' ? this.host : this.guest;
      const at = nextUnshot(s);
      if (shooter === 'host') this.h({ type: 'player-fire', at });
      else this.g({ type: 'player-fire', at });
    }
    expect(this.host.game.phase).toBe('game-over');
    expect(this.guest.game.phase).toBe('game-over');
  }
}

function nextUnshot(s: AppState): Coord {
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 10; col++) {
      if (
        s.game.opponent.cells[row][col] === 'empty' ||
        s.game.opponent.cells[row][col] === 'ship'
      ) {
        return { row, col };
      }
    }
  }
  throw new Error('board exhausted');
}

describe('friend mode: lobby and handshake', () => {
  it('exchanges hello on channel open and reports the opponent name', () => {
    const t = new Table();
    expect(t.host.net?.status).toBe('connecting');
    t.connect();
    expect(t.host.net?.status).toBe('connected');
    expect(t.guest.net?.status).toBe('connected');
    expect(t.host.net?.opponent?.name).toBe('Bob');
    expect(t.guest.net?.opponent?.name).toBe('Ada');
    expect(t.host.message).toContain('Bob joined');
  });

  it('rejects a protocol version mismatch', () => {
    const t = new Table();
    t.connect();
    t.h({ type: 'peer-message', msg: { t: 'hello', v: 99, name: 'Eve', session: 'x' } });
    expect(t.host.net?.status).toBe('error');
  });

  it('cannot go ready before connecting or with an incomplete fleet', () => {
    const t = new Table();
    t.h({ type: 'randomize' });
    t.h({ type: 'ready' });
    expect(t.host.net?.myReady).toBe(false);
    t.connect();
    t.g({ type: 'ready' });
    expect(t.guest.net?.myReady).toBe(false);
    expect(t.guest.message).toMatch(/five ships/);
  });

  it('starts the battle when both are ready, host first, and locks placement after ready', () => {
    const t = new Table();
    t.connect();
    t.placeBoth();
    t.h({ type: 'ready' });
    expect(t.host.net?.myReady).toBe(true);
    expect(t.guest.net?.theirReady).toBe(true);
    expect(t.host.game.phase).toBe('placement');
    const before = t.host.game.player;
    t.h({ type: 'randomize' });
    expect(t.host.game.player).toBe(before);

    t.g({ type: 'ready' });
    expect(t.host.game.phase).toBe('player-turn');
    expect(t.guest.game.phase).toBe('opponent-turn');
    expect(firstMover(t.host.net!)).toBe('player');
  });

  it('surfaces link errors with a readable message', () => {
    const t = new Table();
    t.g({ type: 'link-error', error: { kind: 'room-not-found', message: 'x' } });
    expect(t.guest.net?.status).toBe('error');
    expect(t.guest.message).toContain('K7Q2ZD');
  });
});

describe('friend mode: battle', () => {
  function battle(): Table {
    const t = new Table();
    t.connect();
    t.placeBoth();
    t.readyBoth();
    return t;
  }

  it('resolves a shot on the shooter board only after the result comes back', () => {
    const t = battle();
    const at = { row: 0, col: 0 };
    const target = t.guest.game.player.cells[0][0];
    t.h({ type: 'player-fire', at });
    expect(t.host.net?.pendingFire).toBeNull();
    expect(t.host.game.phase).toBe('opponent-turn');
    expect(t.guest.game.phase).toBe('player-turn');
    const expected = target === 'ship' ? 'hit' : 'miss';
    expect(t.host.game.opponent.cells[0][0]).toMatch(expected === 'hit' ? /hit|sunk/ : /miss/);
    expect(t.guest.game.player.cells[0][0]).toMatch(expected === 'hit' ? /hit|sunk/ : /miss/);
    expect(t.host.game.log).toHaveLength(1);
    expect(t.guest.game.log).toHaveLength(1);
  });

  it('ignores firing out of turn, duplicate cells and double-fires while a shot is pending', () => {
    const t = battle();
    t.g({ type: 'player-fire', at: { row: 0, col: 0 } });
    expect(t.guest.net?.outbox).toHaveLength(0);
    expect(t.guest.game.log).toHaveLength(0);

    t.offline = true;
    t.h({ type: 'player-fire', at: { row: 0, col: 0 } });
    expect(t.host.net?.pendingFire).toEqual({ seq: 0, at: { row: 0, col: 0 } });
    t.h({ type: 'player-fire', at: { row: 0, col: 1 } });
    expect(t.host.net?.pendingFire).toEqual({ seq: 0, at: { row: 0, col: 0 } });
    expect(t.host.net?.seq).toBe(1);
  });

  it('drops out-of-turn, stale and malformed peer messages', () => {
    const t = battle();
    // Guest fires while it is the host's turn.
    t.h({ type: 'peer-message', msg: { t: 'fire', seq: 0, at: { row: 5, col: 5 } } });
    expect(t.host.game.log).toHaveLength(0);
    expect(t.host.net?.outbox).toHaveLength(0);

    // Result for a shot we never fired.
    t.h({
      type: 'peer-message',
      msg: { t: 'result', seq: 3, at: { row: 1, col: 1 }, outcome: 'hit', gameOver: false },
    });
    expect(t.host.game.log).toHaveLength(0);

    // Real shot, then a stale result with the wrong seq / coordinate.
    t.offline = true;
    t.h({ type: 'player-fire', at: { row: 2, col: 2 } });
    t.h({
      type: 'peer-message',
      msg: { t: 'result', seq: 1, at: { row: 2, col: 2 }, outcome: 'miss', gameOver: false },
    });
    t.h({
      type: 'peer-message',
      msg: { t: 'result', seq: 0, at: { row: 2, col: 3 }, outcome: 'miss', gameOver: false },
    });
    expect(t.host.net?.pendingFire).not.toBeNull();
    // Contradictory sunk report is rejected too.
    t.h({
      type: 'peer-message',
      msg: {
        t: 'result',
        seq: 0,
        at: { row: 2, col: 2 },
        outcome: 'sunk',
        sunk: {
          kind: 'destroyer',
          cells: [
            { row: 2, col: 2 },
            { row: 2, col: 3 },
          ],
        },
        gameOver: false,
      },
    });
    expect(t.host.net?.pendingFire).not.toBeNull();
    expect(t.host.game.phase).toBe('player-turn');
  });

  it('plays a full game where both sides agree on every result and the winner', () => {
    const t = battle();
    t.playToEnd();
    const winner = t.host.game.winner === 'player' ? 'host' : 'guest';
    const loser = winner === 'host' ? t.guest : t.host;
    expect(loser.game.winner).toBe('opponent');
    // The winner's tracking grid shows all five of the loser's ships sunk with matching cells.
    const w = winner === 'host' ? t.host : t.guest;
    expect(w.game.opponent.ships.map((s) => s.kind).sort()).toEqual(
      loser.game.player.ships.map((s) => s.kind).sort(),
    );
    expect(t.host.game.log.length).toBe(t.guest.game.log.length);
    for (const [i, shot] of t.host.game.log.entries()) {
      const mirror = t.guest.game.log[i];
      expect(mirror.at).toEqual(shot.at);
      expect(mirror.outcome).toBe(shot.outcome);
      expect(mirror.by).not.toBe(shot.by);
    }
    expect(t.host.net?.forfeit).toBe(false);
  });

  it('rematch needs both players and swaps who fires first', () => {
    const t = battle();
    t.playToEnd();
    t.h({ type: 'rematch' });
    expect(t.host.game.phase).toBe('game-over');
    expect(t.guest.message).toContain('rematch');
    t.g({ type: 'rematch' });
    expect(t.host.game.phase).toBe('placement');
    expect(t.guest.game.phase).toBe('placement');
    expect(t.host.net?.gameNumber).toBe(1);
    expect(firstMover(t.host.net!)).toBe('opponent');
    expect(firstMover(t.guest.net!)).toBe('player');
    t.placeBoth();
    t.readyBoth();
    expect(t.guest.game.phase).toBe('player-turn');
    expect(t.host.game.phase).toBe('opponent-turn');
  });
});

describe('friend mode: disconnects', () => {
  function battle(): Table {
    const t = new Table();
    t.connect();
    t.placeBoth();
    t.readyBoth();
    return t;
  }

  it('resumes after a reconnect and retransmits a pending shot', () => {
    const t = battle();
    t.offline = true;
    t.h({ type: 'player-fire', at: { row: 4, col: 4 } });
    expect(t.dropped).toHaveLength(1);
    t.h({ type: 'link-status', status: 'channel-closed' });
    t.g({ type: 'link-status', status: 'channel-closed' });
    expect(t.host.net?.status).toBe('reconnecting');
    expect(t.host.message).toMatch(/Reconnecting/);

    t.offline = false;
    t.h({ type: 'link-status', status: 'channel-open' });
    t.g({ type: 'link-status', status: 'channel-open' });
    expect(t.host.net?.status).toBe('connected');
    expect(t.guest.net?.status).toBe('connected');
    // The pending shot was re-sent and answered.
    expect(t.host.net?.pendingFire).toBeNull();
    expect(t.host.game.log).toHaveLength(1);
    expect(t.guest.game.log).toHaveLength(1);
    expect(t.guest.game.phase).toBe('player-turn');
  });

  it('answers a repeated fire with the same result instead of a second shot', () => {
    const t = battle();
    t.h({ type: 'player-fire', at: { row: 4, col: 4 } });
    const logBefore = t.guest.game.log.length;
    t.offline = true;
    t.g({ type: 'peer-message', msg: { t: 'fire', seq: 0, at: { row: 4, col: 4 } } });
    expect(t.guest.game.log).toHaveLength(logBefore);
    expect(t.dropped.at(-1)).toMatchObject({ t: 'result', seq: 0, at: { row: 4, col: 4 } });
  });

  it('offers a forfeit win once the grace period expires, and records it as forfeit', () => {
    const t = battle();
    t.h({ type: 'link-status', status: 'channel-closed' });
    t.h({ type: 'claim-win' });
    expect(t.host.game.phase).toBe('player-turn');
    t.h({ type: 'grace-expired' });
    expect(t.host.net?.status).toBe('lost');
    t.h({ type: 'claim-win' });
    expect(t.host.game.phase).toBe('game-over');
    expect(t.host.game.winner).toBe('player');
    expect(t.host.net?.forfeit).toBe(true);
  });

  it('treats an explicit leave as gone immediately', () => {
    const t = battle();
    t.g({ type: 'peer-message', msg: { t: 'leave' } });
    expect(t.guest.net?.status).toBe('left');
    t.g({ type: 'claim-win' });
    expect(t.guest.game.winner).toBe('player');
  });

  it('treats a reloaded opponent (new session) mid-game as having left', () => {
    const t = battle();
    t.h({ type: 'link-status', status: 'channel-closed' });
    t.h({ type: 'link-status', status: 'channel-open' });
    t.h({ type: 'peer-message', msg: { t: 'hello', v: 1, name: 'Bob', session: 'sess-new' } });
    expect(t.host.net?.status).toBe('left');
  });

  it('lets a new guest join after the previous one left before placing', () => {
    const t = new Table();
    t.connect();
    t.h({ type: 'randomize' });
    t.h({ type: 'link-status', status: 'channel-closed' });
    expect(t.host.net?.status).toBe('reconnecting');
    t.h({ type: 'link-status', status: 'channel-open' });
    t.h({ type: 'peer-message', msg: { t: 'hello', v: 1, name: 'Cy', session: 'sess-cy' } });
    expect(t.host.net?.status).toBe('connected');
    expect(t.host.net?.opponent?.name).toBe('Cy');
    expect(t.host.game.player.ships).toHaveLength(5);
  });

  it('a guest leaving a finished game is reported without a forfeit option', () => {
    const t = battle();
    t.playToEnd();
    t.h({ type: 'link-status', status: 'channel-closed' });
    expect(t.host.net?.status).toBe('left');
    const before = t.host.game;
    t.h({ type: 'claim-win' });
    expect(t.host.game).toBe(before);
  });
});
