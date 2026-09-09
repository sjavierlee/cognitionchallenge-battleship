import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { createBoard, randomizeFleet } from '../engine/board';
import { coordLabel } from '../engine/coords';
import { seededRng } from '../engine/rng';
import { App } from './App';

type User = ReturnType<typeof userEvent.setup>;

/** Every game starts on the Home screen; this walks into AI placement. */
async function startAi(user: User) {
  await user.click(screen.getByRole('button', { name: /play vs ai/i }));
}

function cell(boardName: string, label: string): HTMLElement {
  const board = screen.getByRole('region', { name: boardName });
  return within(board).getByRole('button', { name: new RegExp(`^${label},`) });
}

describe('App', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('places ships by clicking, rotates with R, and enables Start once the fleet is complete', async () => {
    const user = userEvent.setup();
    render(<App />);
    await startAi(user);

    const start = screen.getByRole('button', { name: /start battle/i });
    expect(start).toBeDisabled();

    // Carrier is pre-selected; place it horizontally at A1.
    await user.click(cell('Your board', 'A1'));
    expect(cell('Your board', 'E1')).toHaveAccessibleName('E1, ship');
    expect(screen.getByRole('status')).toHaveTextContent(/Battleship/);

    // Rotate and place the Battleship vertically at A3 (row 3 leaves a gap from row 1).
    await user.keyboard('r');
    await user.click(cell('Your board', 'A3'));
    expect(cell('Your board', 'A6')).toHaveAccessibleName('A6, ship');

    // Touching placement is rejected.
    await user.click(cell('Your board', 'B3'));
    expect(screen.getByRole('status')).toHaveTextContent(/must not touch/);

    // Fill in the rest randomly; Start becomes enabled.
    await user.click(screen.getByRole('button', { name: /randomize/i }));
    expect(start).toBeEnabled();
  });

  it('runs a battle turn: player fires, AI replies after a delay, log updates', async () => {
    const user = userEvent.setup();
    render(<App />);
    await startAi(user);

    await user.click(screen.getByRole('button', { name: /randomize/i }));
    await user.click(screen.getByLabelText(/easy/i));
    await user.click(screen.getByRole('button', { name: /start battle/i }));

    expect(screen.getByRole('heading', { name: /enemy waters \(easy ai\)/i })).toBeInTheDocument();
    expect(screen.getByText(/no shots fired yet/i)).toBeInTheDocument();

    await user.click(cell('Enemy board', 'E5'));
    expect(cell('Enemy board', 'E5')).toHaveAccessibleName(/E5, (miss|hit|sunk)/);
    // Enemy board is disabled while the AI thinks.
    expect(cell('Enemy board', 'A1')).toBeDisabled();

    const log = screen.getByRole('list', { name: /shots fired/i });
    await waitFor(() => expect(within(log).getAllByRole('listitem')).toHaveLength(2), {
      timeout: 3000,
    });
    expect(cell('Enemy board', 'A1')).toBeEnabled();

    // Re-firing at the same cell is refused without consuming a turn.
    await user.click(cell('Enemy board', 'E5'));
    expect(screen.getByRole('status')).toHaveTextContent(/already fired/);
    expect(within(log).getAllByRole('listitem')).toHaveLength(2);
  });

  it('shows the Victory overlay and records the win once the enemy fleet is sunk', async () => {
    const user = userEvent.setup();
    // Mirror the reducer's rng consumption: Randomize uses one fleet, Start the next.
    const mirror = seededRng(2024);
    randomizeFleet(createBoard(), mirror);
    const enemy = randomizeFleet(createBoard(), mirror);
    render(<App rng={seededRng(2024)} aiDelayMs={0} />);
    await startAi(user);

    await user.click(screen.getByRole('button', { name: /randomize/i }));
    await user.click(screen.getByLabelText(/hard/i));
    await user.click(screen.getByRole('button', { name: /start battle/i }));

    const targets = enemy.ships.flatMap((s) => s.cells).map(coordLabel);
    for (const [i, label] of targets.entries()) {
      await user.click(cell('Enemy board', label));
      if (i < targets.length - 1) {
        await waitFor(() => expect(cell('Enemy board', label)).toBeEnabled());
      }
    }

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: /victory/i })).toBeInTheDocument();
    expect(dialog).toHaveTextContent(`sank the entire enemy fleet in ${targets.length} shots`);
    expect(dialog).toHaveTextContent('Accuracy100%');
    expect(dialog).toHaveTextContent('Record vs Hard1W – 0L');
    expect(JSON.parse(localStorage.getItem('battleship.record') ?? '{}')).toMatchObject({
      wins: 1,
      losses: 0,
      perDifficulty: { hard: { wins: 1, losses: 0 } },
    });

    // Closing the summary shows the boards again with the actions still at hand.
    await user.click(within(dialog).getByRole('button', { name: /close summary/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const review = screen.getByText(/fleet is revealed/i).closest('.review');
    expect(review).not.toBeNull();
    expect(review).toHaveTextContent(/victory/i);
    expect(
      within(review as HTMLElement).getByRole('button', { name: /play again/i }),
    ).toBeEnabled();
    expect(
      within(review as HTMLElement).getByRole('button', { name: /back to home/i }),
    ).toBeEnabled();
    expect(screen.getByText('Revealed')).toBeInTheDocument();

    // Summary can be brought back, and Escape dismisses it even when focus has left the dialog.
    await user.click(screen.getByRole('button', { name: /summary/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /play again/i }));
    expect(screen.queryByText(/fleet is revealed/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start battle/i })).toBeDisabled();
    // Record stays 1W after Play Again (not double-counted).
    expect(JSON.parse(localStorage.getItem('battleship.record') ?? '{}')).toMatchObject({
      wins: 1,
    });
  });

  it('reveals the surviving enemy ships after a defeat once the summary is closed', async () => {
    const user = userEvent.setup();
    const mirror = seededRng(77);
    randomizeFleet(createBoard(), mirror);
    const enemy = randomizeFleet(createBoard(), mirror);
    render(<App rng={seededRng(77)} aiDelayMs={0} />);
    await startAi(user);

    await user.click(screen.getByRole('button', { name: /randomize/i }));
    await user.click(screen.getByLabelText(/hard/i));
    await user.click(screen.getByRole('button', { name: /start battle/i }));

    // Fire only at open water so the Hard AI sinks our fleet first.
    const water: string[] = [];
    enemy.cells.forEach((row, r) =>
      row.forEach((state, c) => {
        if (state === 'empty') water.push(coordLabel({ row: r, col: c }));
      }),
    );
    for (const label of water) {
      if (screen.queryByRole('dialog')) break;
      await user.click(cell('Enemy board', label));
      await waitFor(() => {
        if (screen.queryByRole('dialog')) return;
        expect(cell('Enemy board', label)).toBeEnabled();
      });
    }

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: /defeat/i })).toBeInTheDocument();
    const shipCell = coordLabel(enemy.ships[0].cells[0]);
    expect(cell('Enemy board', shipCell)).toHaveAccessibleName(`${shipCell}, unknown`);
    const enemyRegion = screen.getByRole('region', { name: 'Enemy board' });
    expect(enemyRegion.querySelectorAll('.board-ship')).toHaveLength(0);

    await user.click(within(dialog).getByRole('button', { name: /close summary/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(cell('Enemy board', shipCell)).toHaveAccessibleName(`${shipCell}, ship`);
    expect(enemyRegion.querySelectorAll('.board-ship')).toHaveLength(5);
    expect(enemyRegion.querySelectorAll('.board-ship--revealed').length).toBeGreaterThan(0);
    expect(screen.getByText(/fleet is revealed/i).closest('.review')).toHaveTextContent(/defeat/i);
    expect(cell('Enemy board', water[0])).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /back to home/i }));
    expect(screen.getByRole('button', { name: /play vs ai/i })).toBeInTheDocument();
  });

  it('persists the sound preference', async () => {
    const user = userEvent.setup();
    render(<App />);
    const toggle = screen.getByRole('button', { name: /enable sound/i });
    await user.click(toggle);
    expect(localStorage.getItem('battleship.sound')).toBe('on');
    expect(screen.getByRole('button', { name: /mute sound/i })).toBeInTheDocument();
  });

  it('follows the system theme by default and persists an explicit toggle', async () => {
    const user = userEvent.setup();
    document.documentElement.dataset.theme = '';
    render(<App />);

    // jsdom's matchMedia stub reports light; no preference is written until the user toggles.
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('battleship.theme')).toBeNull();

    await user.click(screen.getByRole('button', { name: /switch to dark mode/i }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('battleship.theme')).toBe('dark');
    expect(screen.getByRole('button', { name: /switch to light mode/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('applies a saved theme on load', () => {
    localStorage.setItem('battleship.theme', 'dark');
    render(<App />);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(screen.getByRole('button', { name: /switch to light mode/i })).toBeInTheDocument();
  });

  it('shows ship art on the player board and keeps enemy ships hidden until sunk', async () => {
    const user = userEvent.setup();
    render(<App />);
    await startAi(user);
    await user.click(screen.getByRole('button', { name: /randomize/i }));

    const own = screen.getByRole('region', { name: 'Your board' });
    expect(own.querySelectorAll('.board-ship')).toHaveLength(5);

    await user.click(screen.getByRole('button', { name: /start battle/i }));
    const enemy = screen.getByRole('region', { name: 'Enemy board' });
    // Hidden enemy ships draw no sprite on the grid; the roster below still lists all five.
    expect(enemy.querySelectorAll('.board-ship')).toHaveLength(0);
    expect(within(enemy).getAllByTestId('ship-sprite')).toHaveLength(5);
  });
});
