import { describe, expect, it } from 'vitest';
import type { Meld } from './mahjong';
import { layoutMeldTiles } from './tableLayout';

describe('meld table layout', () => {
  it('stacks an exposed kong fourth tile above the middle tile', () => {
    const meld: Meld = { kind: 'kong', tiles: ['m5', 'm5', 'm5', 'm5'], fromPlayer: 1, concealed: false };
    const layout = layoutMeldTiles([meld]);

    expect(layout.map((entry) => entry.slot)).toEqual([0, 1, 2, 1]);
    expect(layout.map((entry) => entry.stacked)).toEqual([false, false, false, true]);
  });

  it('keeps a concealed kong flat across four slots', () => {
    const meld: Meld = { kind: 'kong', tiles: ['p7', 'p7', 'p7', 'p7'], fromPlayer: null, concealed: true };
    const layout = layoutMeldTiles([meld]);

    expect(layout.map((entry) => entry.slot)).toEqual([0, 1, 2, 3]);
    expect(layout.map((entry) => entry.stacked)).toEqual([false, false, false, false]);
    expect(layout.map((entry) => entry.faceDown)).toEqual([true, false, false, true]);
  });
});
