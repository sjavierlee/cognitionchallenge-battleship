import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { createBoard, randomizeFleet } from '../engine/board';
import { coordLabel } from '../engine/coords';
import { seededRng } from '../engine/rng';
import { App } from './App';

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

    await user.click(screen.getByRole('button', { name: /randomize/i }));
    await user.click(screen.getByLabelText(/easy/i));
    await user.click(screen.getByRole('button', { name: /start battle/i }));

    expect(screen.getByRole('heading', { name: /enemy waters \(easy ai\)/i })).toBeInTheDocument();
    expect(screen.getByText(/no shots fired yet/i)).toBeInTheDocument();

    await user.click(cell('Enemy board', 'E5'));
    expect(cell('Enemy board', 'E5')).toHaveAccessibleName(/E5, (miss|hit|sunk)/);
    // Enemy board is disabled while the AI thinks.
    expect(cell('Enemy board', 'A1')).toBeDisabled();

    const log = screen.getByRole('list');
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

    await user.click(within(dialog).getByRole('button', { name: /play again/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start battle/i })).toBeDisabled();
    // Record stays 1W after Play Again (not double-counted).
    expect(JSON.parse(localStorage.getItem('battleship.record') ?? '{}')).toMatchObject({
      wins: 1,
    });
  });

  it('persists the sound preference', async () => {
    const user = userEvent.setup();
    render(<App />);
    const toggle = screen.getByRole('button', { name: /enable sound/i });
    await user.click(toggle);
    expect(localStorage.getItem('battleship.sound')).toBe('on');
    expect(screen.getByRole('button', { name: /mute sound/i })).toBeInTheDocument();
  });
});
