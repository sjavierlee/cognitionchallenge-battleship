import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isFleetComplete } from '../engine/board';
import { seededRng } from '../engine/rng';
import { loadRecord } from '../storage/record';
import { fakeLink } from '../test/fakeLink';
import { App } from './App';

function cell(boardName: string, label: string): HTMLElement {
  const board = screen.getByRole('region', { name: boardName });
  return within(board).getByRole('button', { name: new RegExp(`^${label},`) });
}

function clockOf(label: RegExp): HTMLElement {
  return screen.getByRole('timer', { name: label });
}

function tick(ms: number) {
  act(() => vi.advanceTimersByTime(ms));
}

/**
 * Fake only what the clocks use so React's own scheduling stays real. Clicks go through
 * `fireEvent` rather than user-event, whose async wrapper waits on a (now frozen) timeout.
 */
function fakeTime() {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  });
}

function click(el: HTMLElement) {
  fireEvent.click(el);
}

/** Let the (async) link factory resolve and its effects settle. */
async function settle() {
  await act(async () => {});
}

describe('Bullet Battleship UI', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/');
  });
  afterEach(() => {
    vi.useRealTimers();
    window.history.replaceState(null, '', '/');
  });

  it('vs the AI: toggle in the lobby, clocks on the boards, loss on time under the Bullet record', async () => {
    fakeTime();
    render(<App rng={seededRng(9)} aiDelayMs={0} />);
    click(screen.getByRole('button', { name: /play vs ai/i }));

    // Standard record shown until Bullet is switched on.
    expect(screen.getByTitle(/standard win \/ loss record/i)).toHaveTextContent('0W – 0L');
    const toggle = screen.getByRole('switch', { name: /bullet mode/i });
    expect(toggle).not.toBeChecked();
    click(toggle);
    expect(toggle).toBeChecked();
    expect(screen.getByTitle(/bullet win \/ loss record/i)).toHaveTextContent('Bullet0W – 0L');
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();

    click(screen.getByRole('button', { name: /randomize/i }));
    click(screen.getByRole('button', { name: /start battle/i }));
    expect(screen.getByRole('status')).toHaveTextContent(/minute is ticking/i);

    const mine = clockOf(/^your clock/i);
    const theirs = clockOf(/^normal ai's clock/i);
    expect(screen.getByRole('region', { name: 'Your board' })).toContainElement(mine);
    expect(screen.getByRole('region', { name: 'Enemy board' })).toContainElement(theirs);
    expect(mine).toHaveTextContent('1:00');
    expect(theirs).toHaveTextContent('1:00');
    expect(mine).toHaveClass('clock--running');
    expect(theirs).not.toHaveClass('clock--running');

    // Only my clock moves while I think.
    tick(3_000);
    expect(mine).toHaveTextContent('0:57');
    expect(theirs).toHaveTextContent('1:00');

    click(cell('Enemy board', 'A1'));
    tick(50);
    const log = screen.getByRole('list', { name: /shots fired/i });
    expect(within(log).getAllByRole('listitem')).toHaveLength(2);
    expect(mine).toHaveClass('clock--running');
    expect(mine).toHaveTextContent('0:57');

    // Under ten seconds the clock shows tenths and turns urgent.
    tick(48_000);
    expect(mine).toHaveTextContent('9.0');
    expect(mine).toHaveClass('clock--low');

    // ... and then I run out.
    tick(9_500);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: /defeat/i })).toBeInTheDocument();
    expect(dialog).toHaveTextContent('Out of time · Bullet · Normal AI');
    expect(dialog).toHaveTextContent(/your clock hit zero/i);
    expect(dialog).toHaveTextContent('Bullet vs Normal0W – 1L');
    expect(dialog).toHaveTextContent('Bullet overall0W – 1L');
    expect(dialog).toHaveTextContent('Standard 0W – 0L');
    expect(dialog).toHaveTextContent('Bullet 0W – 1L');
    expect(mine).toHaveTextContent('0.0');
    expect(mine).toHaveClass('clock--flagged');

    const saved = loadRecord();
    expect(saved.wins + saved.losses).toBe(0);
    expect(saved.bullet.losses).toBe(1);
    expect(saved.bullet.perDifficulty.normal).toEqual({ wins: 0, losses: 1 });
    expect(screen.getByTitle(/bullet win \/ loss record/i)).toHaveTextContent('Bullet0W – 1L');

    // Long after the flag nothing else happens (no second result, no AI shot).
    tick(120_000);
    expect(loadRecord().bullet.losses).toBe(1);
    expect(within(log).getAllByRole('listitem')).toHaveLength(2);

    // Closing the summary keeps the clocks in view for the review; Play again keeps Bullet on.
    click(within(dialog).getByRole('button', { name: /close summary/i }));
    expect(screen.getAllByRole('timer')).toHaveLength(2);
    click(screen.getByRole('button', { name: /play again/i }));
    expect(screen.getByRole('switch', { name: /bullet mode/i })).toBeChecked();
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
  });

  it('vs the AI: the AI fires faster in Bullet and can be flagged itself', async () => {
    fakeTime();
    render(<App rng={seededRng(4)} />);
    click(screen.getByRole('button', { name: /play vs ai/i }));
    click(screen.getByRole('switch', { name: /bullet mode/i }));
    click(screen.getByRole('button', { name: /randomize/i }));
    click(screen.getByRole('button', { name: /start battle/i }));

    click(cell('Enemy board', 'J10'));
    const log = screen.getByRole('list', { name: /shots fired/i });
    const theirs = clockOf(/^normal ai's clock/i);
    expect(theirs).toHaveClass('clock--running');
    tick(390);
    expect(within(log).getAllByRole('listitem')).toHaveLength(1);
    tick(20);
    expect(within(log).getAllByRole('listitem')).toHaveLength(2);
    expect(theirs).toHaveTextContent('1:00');
    expect(theirs).not.toHaveClass('clock--running');
  });

  it('with a friend as host: the toggle syncs to the guest, locks on Ready, and time-outs travel', async () => {
    fakeTime();
    const link = fakeLink('Bob');
    render(<App linkFactory={link.factory} rng={seededRng(3)} />);
    fireEvent.change(screen.getByRole('textbox', { name: /your name/i }), {
      target: { value: 'Ada' },
    });
    click(screen.getByRole('button', { name: /host a game/i }));
    await settle();

    const toggle = screen.getByRole('switch', { name: /bullet mode/i });
    click(toggle);
    expect(toggle).toBeChecked();
    expect(link.peer.bullet).toBe(false);

    // The setting travels with the handshake, and with every later change.
    link.connect();
    expect(link.peer.bullet).toBe(true);
    click(toggle);
    expect(link.peer.bullet).toBe(false);
    expect(link.peer.message).toMatch(/Ada switched Bullet off/);
    click(toggle);
    expect(link.peer.bullet).toBe(true);

    click(screen.getByRole('button', { name: /randomize/i }));
    click(screen.getByRole('button', { name: /^ready$/i }));
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.getByText('Bullet on')).toBeInTheDocument();

    link.peerAct({ type: 'randomize' });
    link.peerAct({ type: 'ready' });
    expect(screen.getByText('Your turn')).toBeInTheDocument();
    const mine = clockOf(/^your clock/i);
    const bobs = clockOf(/^bob's clock/i);
    expect(mine).toHaveClass('clock--running');
    expect(link.peer.clock?.running).toBe('opponent');

    tick(2_000);
    click(cell('Enemy board', 'C3'));
    expect(screen.getByText("Bob's turn")).toBeInTheDocument();
    expect(mine).toHaveTextContent('0:58');
    expect(bobs).toHaveClass('clock--running');
    expect(link.peer.clock?.running).toBe('player');

    tick(10_000);
    expect(bobs).toHaveTextContent('0:50');
    link.peerAct({ type: 'player-fire', at: { row: 0, col: 0 } });
    expect(screen.getByText('Your turn')).toBeInTheDocument();
    expect(bobs).toHaveTextContent('0:50');
    expect(bobs).not.toHaveClass('clock--running');
    expect(link.peer.clock?.player).toBe(50_000);

    // I sit on my move until my clock runs out: Bob wins on both screens and gets my fleet.
    tick(58_100);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: /defeat/i })).toBeInTheDocument();
    expect(dialog).toHaveTextContent('Out of time · Bullet · Friend game');
    expect(dialog).toHaveTextContent('Bullet vs friends0W – 1L');
    expect(dialog).toHaveTextContent('Standard 0W – 0L');
    expect(within(dialog).getByRole('button', { name: /rematch/i })).toBeEnabled();
    expect(link.peer.game.phase).toBe('game-over');
    expect(link.peer.game.winner).toBe('player');
    expect(link.peer.clock?.flagged).toBe('opponent');
    expect(link.peer.message).toMatch(/Ada ran out of time/);

    const saved = loadRecord();
    expect(saved.friend).toEqual({ wins: 0, losses: 0 });
    expect(saved.bullet.friend).toEqual({ wins: 0, losses: 1 });

    // The winner's fleet arrived with the flag; closing the summary reveals it for review.
    const enemyRegion = screen.getByRole('region', { name: 'Enemy board' });
    expect(enemyRegion.querySelectorAll('.board-ship')).toHaveLength(0);
    click(within(dialog).getByRole('button', { name: /close summary/i }));
    expect(enemyRegion.querySelectorAll('.board-ship')).toHaveLength(5);
    expect(clockOf(/^your clock/i)).toHaveTextContent('0.0');

    // Rematch: fresh minute for both, guest to fire first, setting kept.
    click(screen.getByRole('button', { name: /rematch/i }));
    link.peerAct({ type: 'rematch' });
    expect(screen.getByRole('switch', { name: /bullet mode/i })).toBeChecked();
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    expect(link.peer.clock).toBeNull();
    expect(link.peer.bullet).toBe(true);
    click(screen.getByRole('button', { name: /randomize/i }));
    click(screen.getByRole('button', { name: /^ready$/i }));
    link.peerAct({ type: 'randomize' });
    link.peerAct({ type: 'ready' });
    expect(screen.getByText("Bob's turn")).toBeInTheDocument();
    expect(clockOf(/^your clock/i)).toHaveTextContent('1:00');
    expect(clockOf(/^bob's clock/i)).toHaveTextContent('1:00');
    expect(clockOf(/^bob's clock/i)).toHaveClass('clock--running');
  });

  it('with a friend as guest: the setting is a locked badge, and a silent host is flagged after the grace', async () => {
    fakeTime();
    window.history.replaceState(null, '', '/#/room/k7q2zd');
    const link = fakeLink('Ada');
    render(<App linkFactory={link.factory} rng={seededRng(5)} />);
    click(screen.getByRole('button', { name: /join game/i }));
    await settle();
    link.connect();
    expect(screen.getByText(/connected with ada/i)).toBeInTheDocument();

    // No switch for the guest, only what the host decided.
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.getByText('Bullet off')).toBeInTheDocument();
    expect(screen.getByText(/Ada chooses/)).toBeInTheDocument();
    link.peerAct({ type: 'set-bullet', bullet: true });
    expect(screen.getByText('Bullet on')).toBeInTheDocument();
    expect(screen.getByText(/Ada switched on Bullet/)).toBeInTheDocument();
    expect(screen.getByTitle(/bullet win \/ loss record/i)).toBeInTheDocument();
    link.peerAct({ type: 'set-bullet', bullet: false });
    expect(screen.getByText('Bullet off')).toBeInTheDocument();
    link.peerAct({ type: 'set-bullet', bullet: true });

    click(screen.getByRole('button', { name: /randomize/i }));
    click(screen.getByRole('button', { name: /^ready$/i }));
    link.peerAct({ type: 'randomize' });
    link.peerAct({ type: 'ready' });

    // Host fires first; their clock runs on my screen.
    expect(screen.getByText("Ada's turn")).toBeInTheDocument();
    const adas = clockOf(/^ada's clock/i);
    expect(adas).toHaveClass('clock--running');
    tick(60_000);
    expect(adas).toHaveTextContent('0.0');
    // Their own screen should have flagged them by now; we give them a moment before calling it.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    tick(5_100);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: /victory/i })).toBeInTheDocument();
    expect(dialog).toHaveTextContent('Ada ran out of time · Bullet · Friend game');
    expect(dialog).toHaveTextContent(/you win on time with 1:00 to spare/i);
    expect(dialog).toHaveTextContent('Bullet vs friends1W – 0L');
    expect(link.peer.game.phase).toBe('game-over');
    expect(link.peer.game.winner).toBe('opponent');
    expect(link.peer.clock?.flagged).toBe('player');
    expect(isFleetComplete(link.peer.game.opponent)).toBe(true);
    expect(loadRecord().bullet.friend).toEqual({ wins: 1, losses: 0 });
    expect(loadRecord().friend).toEqual({ wins: 0, losses: 0 });
  });
});
