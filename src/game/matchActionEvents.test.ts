import { describe, expect, it } from 'vitest';
import { createInitialState } from './mahjong';
import { detectMatchActionSignals, matchActionDuration } from './matchActionEvents';

describe('match action signals', () => {
  it('reports melds and ready declarations in seat order', () => {
    const previous = createInitialState(() => 0.42);
    const current = structuredClone(previous);
    current.players[1].melds.push({ kind: 'pong', tiles: ['m2', 'm2', 'm2'], fromPlayer: 0, concealed: false });
    current.readyDeclared[3] = true;

    expect(detectMatchActionSignals(previous, current)).toEqual([
      { seat: 1, kind: 'pong' },
      { seat: 3, kind: 'ready' },
    ]);
  });

  it('reports self draw only when settlement first appears', () => {
    const previous = createInitialState(() => 0.42);
    const current = structuredClone(previous);
    current.winner = 2;
    current.winnerBy = 'selfDraw';
    current.settlement = { reason: 'win', tai: 1, patterns: [], deltas: [0, 0, 0, 0], bankruptPlayer: null };

    expect(detectMatchActionSignals(previous, current)).toEqual([{ seat: 2, kind: 'selfDraw' }]);
    expect(detectMatchActionSignals(current, current)).toEqual([]);
  });

  it('holds ordinary calls for one second and winning calls for 2.5 seconds', () => {
    expect(matchActionDuration('chi')).toBe(1_000);
    expect(matchActionDuration('ready')).toBe(1_000);
    expect(matchActionDuration('win')).toBe(2_500);
    expect(matchActionDuration('selfDraw')).toBe(2_500);
  });
});
