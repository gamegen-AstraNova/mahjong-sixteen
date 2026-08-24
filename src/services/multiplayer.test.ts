import { describe, expect, it } from 'vitest';
import { createInitialState } from '../game/mahjong';
import { rotateMahjongState } from './multiplayer';

describe('multiplayer seat projection', () => {
  it('rotates every seat-indexed field so the local player is always at seat zero', () => {
    const source = createInitialState(() => 0.37);
    source.points = [10, 20, 30, 40];
    source.currentPlayer = 0;
    source.dealer = 3;
    source.eastSeat = 1;
    source.winner = 1;
    source.loser = 3;
    source.pendingDiscard = { player: 0, tile: 'm1' };
    source.lastTileFocus = { area: 'win', seat: 1, riverSeat: 3, tile: 'm1' };
    source.players[0].melds = [{ kind: 'pong', tiles: ['m1', 'm1', 'm1'], fromPlayer: 3, concealed: false }];

    const rotated = rotateMahjongState(source, 2);

    expect(rotated.points).toEqual([30, 40, 10, 20]);
    expect(rotated).toMatchObject({ currentPlayer: 2, dealer: 1, eastSeat: 3, winner: 3, loser: 1 });
    expect(rotated.pendingDiscard?.player).toBe(2);
    expect(rotated.lastTileFocus).toEqual({ area: 'win', seat: 3, riverSeat: 1, tile: 'm1' });
    expect(rotated.players[2].melds[0].fromPlayer).toBe(1);
    expect(rotated.players[0].concealed).toEqual(source.players[2].concealed);
  });
});
