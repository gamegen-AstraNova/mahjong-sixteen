import { describe, expect, it } from 'vitest';
import { autoPlayCurrentTurn, calculateTai, claimDiscard, createInitialState, createWall, declareKong, declareReady, discardTile, isFlower, isWinningHand, kongTiles, readyDiscardIndices, sortTiles, type MahjongState, type PlayerHand, type TileId } from './mahjong';

function hand(concealed: TileId[] = []): PlayerHand {
  return { concealed, flowers: [], discards: [], melds: [] };
}

function claimState(playerTiles: TileId[], discarded: TileId, discarder = 3): MahjongState {
  const players = [hand(playerTiles), hand(), hand(), hand()];
  players[discarder] = hand([discarded]);
  return {
    players,
    wall: Array.from({ length: 20 }, () => 'm9' as TileId),
    currentPlayer: discarder,
    winner: null,
    winnerBy: null,
    loser: null,
    exhausted: false,
    phase: 'discard',
    pendingDiscard: null,
    claimOptions: [],
    lastDrawn: discarded,
    lastTileFocus: null,
    points: [25_000, 25_000, 25_000, 25_000],
    readyDeclared: [false, false, false, false],
    settlement: null,
  };
}

describe('Taiwan mahjong core', () => {
  it('creates a 144-tile wall', () => {
    expect(createWall(() => 0.5)).toHaveLength(144);
  });

  it('deals 17 tiles to the dealer and 16 to others without starting flowers', () => {
    const state = createInitialState(() => 0.37);
    expect(state.players.map((player) => player.concealed.length)).toEqual([17, 16, 16, 16]);
    expect(state.players.every((player) => player.concealed.every((tile) => !isFlower(tile)))).toBe(true);
    expect(state.players.every((player) => player.flowers.length === 0)).toBe(true);
    expect(state.wall).toHaveLength(79);
  });

  it('reveals flowers only when drawn, then supplies a replacement tile', () => {
    const state: MahjongState = {
      players: [hand(['m1']), hand(), hand(), hand()],
      wall: [...Array.from({ length: 8 }, () => 'm9' as TileId), 'm2', 'f1'],
      currentPlayer: 0,
      winner: null,
      winnerBy: null,
      loser: null,
      exhausted: false,
      phase: 'discard',
      pendingDiscard: null,
      claimOptions: [],
      lastDrawn: 'm1',
      lastTileFocus: null,
      points: [25_000, 25_000, 25_000, 25_000],
      readyDeclared: [false, false, false, false],
      settlement: null,
    };

    const next = discardTile(state, 0);
    expect(next.players[3].flowers).toEqual(['f1']);
    expect(next.players[3].concealed).toEqual(['m2']);
  });

  it('keeps the drawn tile at the far right, then sorts after discarding', () => {
    const state = createInitialState(() => 0.37);
    expect(state.players[0].concealed.at(-1)).toBe(state.lastDrawn);

    const next = discardTile(state, 0);
    expect(next.players[0].concealed).toEqual(sortTiles(next.players[0].concealed));
  });

  it('recognizes five melds and one pair', () => {
    const winning = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'p1', 'p2', 'p3', 's7', 's8', 's9', 'd1', 'd1', 'd1', 'w1', 'w1'] as TileId[];
    expect(isWinningHand(winning)).toBe(true);
    expect(isWinningHand(winning.slice(0, -1))).toBe(false);
  });

  it('finds a ready discard, records the declaration, and locks later turns to the drawn tile', () => {
    const waiting = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'p1', 'p2', 'p3', 's7', 's8', 's9', 'd1', 'd1', 'd1', 'w1', 'm9'] as TileId[];
    const state = claimState(waiting, 'm9');
    state.currentPlayer = 0;
    const ready = readyDiscardIndices(state, 0);
    expect(ready).toContain(16);
    const declared = declareReady(state, 16);
    expect(declared.readyDeclared[0]).toBe(true);
  });

  it('calculates named Taiwan tai patterns', () => {
    const winning = hand(['m1', 'm1', 'm1', 'm2', 'm2', 'm2', 'm3', 'm3', 'm3', 'm4', 'm4', 'm4', 'm5', 'm5', 'm5', 'm6', 'm6']);
    const result = calculateTai(winning, { selfDraw: true, ready: true, seat: 0 });
    expect(result.total).toBeGreaterThanOrEqual(10);
    expect(result.patterns).toContainEqual({ id: 'closedSelfDrawBonus', tai: 3 });
    expect(result.patterns.map((pattern) => pattern.id)).toEqual(expect.arrayContaining(['ready', 'allTriplets', 'fullFlush']));
    expect(result.patterns.map((pattern) => pattern.id)).not.toEqual(expect.arrayContaining(['selfDraw', 'closed']));
  });

  it('opens a player claim window and applies chi', () => {
    const pending = discardTile(claimState(['m1', 'm2'], 'm3', 1), 0);
    expect(pending.phase).toBe('claim');
    expect(pending.claimOptions.some((option) => option.kind === 'chi')).toBe(true);
    const chiIndex = pending.claimOptions.findIndex((option) => option.kind === 'chi');
    const claimed = claimDiscard(pending, chiIndex);
    expect(claimed.players[0].melds[0]).toMatchObject({ kind: 'chi', tiles: ['m1', 'm2', 'm3'] });
    expect(claimed.players[1].discards).toHaveLength(0);
    expect(claimed.lastTileFocus).toEqual({ area: 'meld', seat: 0, tile: 'm3', meldIndex: 0, tileIndex: 2 });
  });

  it('advances turns counterclockwise', () => {
    const state: MahjongState = {
      ...claimState(['m1'], 'm9'),
      currentPlayer: 0,
      players: [hand(['m1']), hand(), hand(), hand()],
    };

    const next = discardTile(state, 0);

    expect(next.currentPlayer).toBe(3);
    expect(next.players[3].concealed).toHaveLength(1);
    expect(next.lastTileFocus).toEqual({ area: 'river', seat: 0, tile: 'm1' });
  });

  it('allows the player to win on another seat discard', () => {
    const waiting = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'p1', 'p2', 'p3', 's7', 's8', 's9', 'd1', 'd1', 'd1', 'w1'] as TileId[];
    const pending = discardTile(claimState(waiting, 'w1'), 0);
    expect(pending.claimOptions[0]?.kind).toBe('win');
    const won = claimDiscard(pending, 0);
    expect(won).toMatchObject({ winner: 0, winnerBy: 'discard', loser: 3 });
    expect(won.points).toEqual([25_900, 25_000, 25_000, 24_100]);
    expect(won.settlement).toMatchObject({ tai: 2, deltas: [900, 0, 0, -900] });
  });

  it('upgrades an exposed pong to a kong when the fourth tile is held', () => {
    const state = claimState(['p5'], 'm9');
    state.currentPlayer = 0;
    state.players[0].melds.push({ kind: 'pong', tiles: ['p5', 'p5', 'p5'], fromPlayer: 1, concealed: false });

    expect(kongTiles(state, 0)).toContain('p5');
    const upgraded = declareKong(state, 'p5');

    expect(upgraded.players[0].melds).toContainEqual({ kind: 'kong', tiles: ['p5', 'p5', 'p5', 'p5'], fromPlayer: 1, concealed: false });
    expect(upgraded.players[0].concealed).not.toContain('p5');
    expect(upgraded.players[0].concealed).toHaveLength(1);
    expect(upgraded.lastTileFocus).toEqual({ area: 'meld', seat: 0, tile: 'p5', meldIndex: 0, tileIndex: 3 });
  });

  it('automatically completes a timed-out discard turn', () => {
    const state = createInitialState(() => 0.37);
    const completed = autoPlayCurrentTurn(state, () => 0);
    expect(completed).not.toBe(state);
    expect(completed.players[0].concealed).toHaveLength(16);
  });

  it('automatically discards the newly drawn tile after ready is declared', () => {
    const drawn = 'd3' as TileId;
    const state = claimState(['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'p1', 'p2', 'p3', 's1', 's2', 's3', 'w1', 'w2', 'w3', 'd1', drawn], drawn);
    state.currentPlayer = 0;
    state.lastDrawn = drawn;
    state.readyDeclared[0] = true;

    const completed = autoPlayCurrentTurn(state);

    expect(completed.players[0].discards.at(-1)).toBe(drawn);
    expect(completed.players[0].concealed).not.toContain(drawn);
  });

  it('automatically accepts a winning claim but passes optional calls', () => {
    const waiting = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'p1', 'p2', 'p3', 's7', 's8', 's9', 'd1', 'd1', 'd1', 'w1'] as TileId[];
    const winningClaim = discardTile(claimState(waiting, 'w1'), 0);
    expect(autoPlayCurrentTurn(winningClaim)).toMatchObject({ winner: 0, winnerBy: 'discard' });

    const optionalClaim = discardTile(claimState(['m1', 'm2'], 'm3'), 0);
    expect(autoPlayCurrentTurn(optionalClaim).phase).not.toBe('claim');
  });
});
