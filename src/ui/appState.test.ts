import { describe, expect, it } from 'vitest';
import { appReducer, initialAppState } from './appState';

describe('appReducer placement', () => {
  it('picking up a ship adopts its orientation', () => {
    let s = initialAppState();
    s = appReducer(s, { type: 'rotate' }); // vertical
    s = appReducer(s, { type: 'place-at', at: { row: 0, col: 0 } }); // carrier, vertical
    s = appReducer(s, { type: 'rotate' }); // back to horizontal for the next ship
    expect(s.orientation).toBe('horizontal');

    const viaTray = appReducer(s, { type: 'pick-up', kind: 'carrier' });
    expect(viaTray.selectedShip).toBe('carrier');
    expect(viaTray.orientation).toBe('vertical');

    const viaBoard = appReducer(s, { type: 'place-at', at: { row: 2, col: 0 } });
    expect(viaBoard.selectedShip).toBe('carrier');
    expect(viaBoard.orientation).toBe('vertical');
  });
});
