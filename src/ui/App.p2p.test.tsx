import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { coordLabel } from '../engine/coords';
import { seededRng } from '../engine/rng';
import type { Coord } from '../engine/types';
import { loadRecord } from '../storage/record';
import { fakeLink } from '../test/fakeLink';
import { App } from './App';

function cell(boardName: string, label: string): HTMLElement {
  const board = screen.getByRole('region', { name: boardName });
  return within(board).getByRole('button', { name: new RegExp(`^${label},`) });
}

describe('friend mode UI', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/');
  });
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('hosts a room, plays a turn each way, and wins by forfeit after a disconnect', async () => {
    const user = userEvent.setup();
    const link = fakeLink('Bob');
    render(<App linkFactory={link.factory} reconnectGraceMs={1000} rng={seededRng(3)} />);

    await user.type(screen.getByRole('textbox', { name: /your name/i }), 'Ada');
    await user.click(screen.getByRole('button', { name: /host a game/i }));

    expect(link.calls).toEqual([{ role: 'host', code: expect.stringMatching(/^[A-Z2-9]{6}$/) }]);
    const code = link.calls[0].code;
    expect(window.location.hash).toBe(`#/room/${code}`);
    expect(screen.getByLabelText(/^room code /i)).toHaveTextContent(code);
    expect(screen.getByRole('button', { name: /copy invite link/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^ready$/i })).toBeDisabled();

    link.connect();
    expect(screen.getByText(/connected with bob/i)).toBeInTheDocument();
    expect(link.peer.net?.opponent?.name).toBe('Ada');
    expect(screen.getByText(/is placing their fleet/i)).toHaveTextContent(/^Bob is placing/);

    // Ready needs a full fleet, then locks placement.
    await user.click(screen.getByRole('button', { name: /randomize/i }));
    await user.click(screen.getByRole('button', { name: /^ready$/i }));
    expect(screen.getByRole('button', { name: /waiting for bob/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /randomize/i })).toBeDisabled();

    link.peerAct({ type: 'randomize' });
    link.peerAct({ type: 'ready' });

    // Host fires first.
    expect(screen.getByRole('heading', { name: /bob's waters/i })).toBeInTheDocument();
    expect(screen.getByText('Your turn')).toBeInTheDocument();
    await user.click(cell('Enemy board', 'C3'));
    expect(cell('Enemy board', 'C3')).toHaveAccessibleName(/C3, (miss|hit|sunk)/);
    expect(link.peer.game.log).toHaveLength(1);
    expect(screen.getByText("Bob's turn")).toBeInTheDocument();
    expect(cell('Enemy board', 'A1')).toBeDisabled();

    link.peerAct({ type: 'player-fire', at: { row: 0, col: 0 } });
    const log = screen.getByRole('list', { name: /shots fired/i });
    const items = within(log).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Bob');
    expect(items[0]).toHaveTextContent('A1');
    expect(screen.getByText('Your turn')).toBeInTheDocument();

    // Opponent drops: reconnect banner, then Claim win once the grace period lapses.
    link.disconnect();
    expect(screen.getAllByText(/reconnecting to bob/i).length).toBeGreaterThan(0);
    expect(cell('Enemy board', 'B2')).toBeDisabled();
    const claim = await screen.findByRole('button', { name: /claim win/i }, { timeout: 4000 });
    await user.click(claim);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: /victory/i })).toBeInTheDocument();
    expect(dialog).toHaveTextContent(/by forfeit/i);
    expect(dialog).toHaveTextContent('Record vs friends1W – 0L');
    expect(within(dialog).queryByRole('button', { name: /rematch/i })).not.toBeInTheDocument();
    expect(loadRecord().friend).toEqual({ wins: 1, losses: 0 });

    await user.click(within(dialog).getByRole('button', { name: /back to home/i }));
    expect(screen.getByRole('button', { name: /play vs ai/i })).toBeInTheDocument();
    expect(window.location.hash).toBe('');
    expect(localStorage.getItem('battleship.name')).toBe('Ada');
    expect(localStorage.getItem('battleship.mode')).toBe('friend');
  });

  it('joins from an invite link and waits for the host to fire first', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/#/room/k7q2zd');
    const link = fakeLink('Ada');
    render(<App linkFactory={link.factory} rng={seededRng(5)} />);

    const codeInput = screen.getByRole('textbox', { name: /room code/i });
    expect(codeInput).toHaveValue('K7Q2ZD');
    await user.click(screen.getByRole('button', { name: /join game/i }));
    expect(link.calls).toEqual([{ role: 'guest', code: 'K7Q2ZD' }]);
    expect(screen.getByText(/host fires first/i)).toBeInTheDocument();

    link.connect();
    expect(screen.getByText(/connected with ada/i)).toBeInTheDocument();
    expect(screen.getByText(/ada fires first/i)).toBeInTheDocument();
    expect(link.peer.net?.opponent?.name).toBe('Captain');

    await user.click(screen.getByRole('button', { name: /randomize/i }));
    await user.click(screen.getByRole('button', { name: /^ready$/i }));
    link.peerAct({ type: 'randomize' });
    link.peerAct({ type: 'ready' });

    expect(screen.getByText("Ada's turn")).toBeInTheDocument();
    expect(cell('Enemy board', 'A1')).toBeDisabled();
    link.peerAct({ type: 'player-fire', at: { row: 9, col: 9 } });
    expect(screen.getByText('Your turn')).toBeInTheDocument();
    expect(cell('Enemy board', 'A1')).toBeEnabled();
  });

  it('picks up an invite link pasted into an already-open Home tab', async () => {
    const user = userEvent.setup();
    const link = fakeLink('Ada');
    render(<App linkFactory={link.factory} rng={seededRng(5)} />);

    const codeInput = screen.getByRole('textbox', { name: /room code/i });
    await user.click(screen.getByRole('button', { name: /join game/i }));
    expect(screen.getByText(/codes are 6 letters or digits/i)).toBeInTheDocument();

    // Same-document navigation to a share link fires hashchange, not a page load.
    window.location.hash = '#/room/k7q2zd';
    await waitFor(() => expect(codeInput).toHaveValue('K7Q2ZD'));
    expect(screen.queryByText(/codes are 6 letters or digits/i)).not.toBeInTheDocument();
    expect(screen.getByText(/you opened an invite link/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /join game/i }));
    expect(link.calls).toEqual([{ role: 'guest', code: 'K7Q2ZD' }]);
    expect(window.location.hash).toBe('#/room/K7Q2ZD');
  });

  it('reveals the winner fleet to the loser once the summary is closed, with rematch still on offer', async () => {
    const user = userEvent.setup();
    const link = fakeLink('Bob');
    render(<App linkFactory={link.factory} rng={seededRng(3)} />);
    await user.click(screen.getByRole('button', { name: /host a game/i }));
    link.connect();
    await user.click(screen.getByRole('button', { name: /randomize/i }));
    await user.click(screen.getByRole('button', { name: /^ready$/i }));
    link.peerAct({ type: 'randomize' });
    link.peerAct({ type: 'ready' });

    // We fire only at Bob's open water; Bob works through every one of our ship cells.
    const bobBoard = link.peer.game.player;
    const water: Coord[] = [];
    const mine: Coord[] = [];
    bobBoard.cells.forEach((row, r) =>
      row.forEach((state, c) => {
        if (state === 'empty') water.push({ row: r, col: c });
      }),
    );
    const ownRegion = screen.getByRole('region', { name: 'Your board' });
    for (const btn of within(ownRegion).getAllByRole('button', { name: /, ship$/ })) {
      const label = btn.getAttribute('aria-label')?.split(',')[0] ?? '';
      mine.push({ row: Number(label.slice(1)) - 1, col: label.charCodeAt(0) - 65 });
    }
    expect(mine).toHaveLength(17);
    for (const [i, target] of mine.entries()) {
      await user.click(cell('Enemy board', coordLabel(water[i])));
      link.peerAct({ type: 'player-fire', at: target });
    }

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: /defeat/i })).toBeInTheDocument();
    const enemyRegion = screen.getByRole('region', { name: 'Enemy board' });
    expect(enemyRegion.querySelectorAll('.board-ship')).toHaveLength(0);

    await user.click(within(dialog).getByRole('button', { name: /close summary/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText(/bob's fleet is revealed/i)).toBeInTheDocument();
    expect(enemyRegion.querySelectorAll('.board-ship')).toHaveLength(5);
    for (const ship of bobBoard.ships) {
      const label = coordLabel(ship.cells[0]);
      expect(cell('Enemy board', label)).toHaveAccessibleName(`${label}, ship`);
    }
    // Our misses are still on the grid.
    expect(cell('Enemy board', coordLabel(water[0]))).toHaveAccessibleName(/, miss$/);

    // Rematch and Back to home are still on offer from the review bar.
    expect(screen.getByRole('button', { name: /back to home/i })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: /^rematch$/i }));
    expect(screen.getByRole('button', { name: /waiting for bob/i })).toBeDisabled();
    link.peerAct({ type: 'rematch' });
    expect(screen.getByRole('button', { name: /^ready$/i })).toBeInTheDocument();
    expect(screen.queryByText(/fleet is revealed/i)).not.toBeInTheDocument();
  });

  it('rejects a malformed code and explains connection errors', async () => {
    const user = userEvent.setup();
    const link = fakeLink('Ada');
    render(<App linkFactory={link.factory} />);

    await user.type(screen.getByRole('textbox', { name: /room code/i }), 'abc');
    await user.click(screen.getByRole('button', { name: /join game/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/6 letters or digits/i);
    expect(link.calls).toHaveLength(0);

    await user.clear(screen.getByRole('textbox', { name: /room code/i }));
    await user.type(
      screen.getByRole('textbox', { name: /room code/i }),
      'https://x.test/#/room/QQQQQQ',
    );
    await user.click(screen.getByRole('button', { name: /join game/i }));
    await waitFor(() => expect(link.calls).toEqual([{ role: 'guest', code: 'QQQQQQ' }]));

    link.fail('room-not-found');
    expect(screen.getByText(/no open game found for code QQQQQQ/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^ready$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /back to home/i }));
    expect(screen.getByRole('button', { name: /play vs ai/i })).toBeInTheDocument();
  });
});
