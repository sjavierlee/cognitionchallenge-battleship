import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
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

  it('persists the sound preference', async () => {
    const user = userEvent.setup();
    render(<App />);
    const toggle = screen.getByRole('button', { name: /enable sound/i });
    await user.click(toggle);
    expect(localStorage.getItem('battleship.sound')).toBe('on');
    expect(screen.getByRole('button', { name: /mute sound/i })).toBeInTheDocument();
  });
});
