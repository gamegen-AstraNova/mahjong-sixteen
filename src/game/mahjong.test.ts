import { describe, expect, it } from 'vitest';
import { TURN_TIME_SECONDS, advanceAfterAllPasses, autoPlayCurrentTurn, calculateTai, claimDiscard, claimDiscardForPlayer, createInitialState, createWall, declareKong, declareReady, declareReadyAwaitingClaims, discardTile, discardTileAwaitingClaims, getClaimOptions, isFlower, isWinningHand, kongTiles, readyDiscardIndices, seatWindForPlayer, sortTiles, startNextHand, waitingTiles, type MahjongState, type PlayerHand, type TileId } from './mahjong';

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
    dealer: 0,
    eastSeat: 0,
    prevailingWind: 'w1',
    handNumber: 0,
    dealerStreak: 0,
    circleComplete: false,
    matchComplete: false,
  };
}

describe('Taiwan mahjong core', () => {
  it('uses the shared fifteen-second player action limit', () => {
    expect(TURN_TIME_SECONDS).toBe(15);
  });

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
      dealer: 0,
      eastSeat: 0,
      prevailingWind: 'w1',
      handNumber: 0,
      dealerStreak: 0,
      circleComplete: false,
      matchComplete: false,
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
    expect(waitingTiles(declared, 0)).toContainEqual({ tile: 'w1', remaining: 3 });
  });

  it('deals the extra tile to the current dealer', () => {
    const state = createInitialState(() => 0.37, [25_000, 25_000, 25_000, 25_000], { dealer: 2, handNumber: 2, dealerStreak: 0 });
    expect(state.players.map((player) => player.concealed.length)).toEqual([16, 16, 17, 16]);
    expect(state.currentPlayer).toBe(2);
  });

  it('retains a winning dealer and rotates after another seat wins', () => {
    const dealerWin = claimState([], 'm9');
    dealerWin.winner = 0;
    dealerWin.settlement = { reason: 'win', tai: 1, patterns: [], deltas: [700, -700, 0, 0], bankruptPlayer: null };
    const retained = startNextHand(dealerWin, () => 0.37);
    expect(retained).toMatchObject({ dealer: 0, eastSeat: 0, prevailingWind: 'w1', handNumber: 0, dealerStreak: 1, currentPlayer: 0 });

    const otherWin = claimState([], 'm9');
    otherWin.winner = 3;
    otherWin.settlement = { reason: 'win', tai: 1, patterns: [], deltas: [-700, 0, 0, 700], bankruptPlayer: null };
    const rotated = startNextHand(otherWin, () => 0.37);
    expect(rotated).toMatchObject({ dealer: 3, eastSeat: 0, prevailingWind: 'w1', handNumber: 1, dealerStreak: 0, currentPlayer: 3 });

    const draw = claimState([], 'm9');
    draw.settlement = { reason: 'draw', tai: 0, patterns: [], deltas: [0, 0, 0, 0], bankruptPlayer: null };
    const retainedAfterDraw = startNextHand(draw, () => 0.37);
    expect(retainedAfterDraw).toMatchObject({ dealer: 0, eastSeat: 0, prevailingWind: 'w1', handNumber: 0, dealerStreak: 1, currentPlayer: 0 });
  });

  it('advances through four prevailing-wind circles and preserves dealer continuations', () => {
    const waiting = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'p1', 'p2', 'p3', 's7', 's8', 's9', 'd1', 'd1', 'd1', 'w1'] as TileId[];
    const eastFour = claimState(waiting, 'w1', 3);
    eastFour.dealer = 1;
    eastFour.handNumber = 3;
    const eastSettlement = claimDiscard(discardTile(eastFour, 0), 0);
    expect(eastSettlement).toMatchObject({ circleComplete: true, matchComplete: false });

    const southOne = startNextHand(eastSettlement, () => 0.37);
    expect(southOne).toMatchObject({ prevailingWind: 'w2', handNumber: 0, dealer: 0, dealerStreak: 0, circleComplete: false, matchComplete: false });

    const southDealerWin = structuredClone(southOne);
    southDealerWin.winner = southDealerWin.dealer;
    southDealerWin.settlement = { reason: 'win', tai: 1, patterns: [], deltas: [700, -700, 0, 0], bankruptPlayer: null };
    const continued = startNextHand(southDealerWin, () => 0.37);
    expect(continued).toMatchObject({ prevailingWind: 'w2', handNumber: 0, dealer: 0, dealerStreak: 1 });

    const northFour = claimState(waiting, 'w1', 3);
    northFour.dealer = 1;
    northFour.prevailingWind = 'w4';
    northFour.handNumber = 3;
    const northSettlement = claimDiscard(discardTile(northFour, 0), 0);
    expect(northSettlement).toMatchObject({ circleComplete: true, matchComplete: true });
    expect(startNextHand(northSettlement, () => 0.37)).toBe(northSettlement);
  });

  it('randomizes the East seat once and keeps East, South, West, North counterclockwise', () => {
    expect([0.01, 0.26, 0.51, 0.76].map((value) => createInitialState(() => value).eastSeat)).toEqual([0, 1, 2, 3]);
    for (let eastSeat = 0; eastSeat < 4; eastSeat += 1) {
      const counterclockwiseSeats = [eastSeat, (eastSeat + 3) % 4, (eastSeat + 2) % 4, (eastSeat + 1) % 4];
      expect(counterclockwiseSeats.map((player) => seatWindForPlayer(player, eastSeat))).toEqual(['w1', 'w2', 'w3', 'w4']);
    }
  });

  it('calculates named Taiwan tai patterns', () => {
    const winning = hand(['m1', 'm1', 'm1', 'm2', 'm2', 'm2', 'm3', 'm3', 'm3', 'm4', 'm4', 'm4', 'm5', 'm5', 'm5', 'm6', 'm6']);
    const result = calculateTai(winning, { selfDraw: true, ready: true, seat: 0, dealer: 3, eastSeat: 2, prevailingWind: 'w1', dealerStreak: 0 });
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
    expect(claimed.players[0].melds[0]).toMatchObject({ kind: 'chi', tiles: ['m1', 'm3', 'm2'] });
    expect(claimed.players[1].discards).toHaveLength(0);
    expect(claimed.lastTileFocus).toEqual({ area: 'meld', seat: 0, tile: 'm3', meldIndex: 0, tileIndex: 1 });
  });

  it('supports authoritative claim windows for any player without resolving them on the client', () => {
    const waiting = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'p1', 'p2', 'p3', 's7', 's8', 's9', 'd1', 'd1', 'd1', 'w1'] as TileId[];
    const source = claimState(waiting, 'w1', 3);
    const pending = discardTileAwaitingClaims(source, 3, 0);
    expect(pending).toMatchObject({ phase: 'claim', pendingDiscard: { player: 3, tile: 'w1' }, winner: null });
    expect(pending.claimOptions).toEqual([]);

    const winIndex = getClaimOptions(pending, 0).findIndex((option) => option.kind === 'win');
    const won = claimDiscardForPlayer(pending, 0, winIndex);
    expect(won).toMatchObject({ winner: 0, winnerBy: 'discard', loser: 3 });

    const noClaim = discardTileAwaitingClaims(claimState([], 'm9', 3), 3, 0);
    const advanced = advanceAfterAllPasses(noClaim);
    expect(advanced).toMatchObject({ phase: 'discard', currentPlayer: 2, pendingDiscard: null });
  });

  it('validates ready declarations before opening an authoritative claim window', () => {
    const tiles = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'p1', 'p2', 'p3', 's7', 's8', 's9', 'd1', 'd1', 'd1', 'w1', 'm9'] as TileId[];
    const source = claimState(tiles, 'm9');
    source.currentPlayer = 0;
    const declared = declareReadyAwaitingClaims(source, 0, 16);
    expect(declared.readyDeclared[0]).toBe(true);
    expect(declared).toMatchObject({ phase: 'claim', pendingDiscard: { player: 0, tile: 'm9' } });
  });

  it('adds dealer and continuation tai to the dealer-side payment', () => {
    const winning = hand(['m1', 'm1', 'm1', 'm2', 'm2', 'm2', 'm3', 'm3', 'm3', 'm4', 'm4', 'm4', 'm5', 'm5', 'm5', 'm6', 'm6']);
    const dealerTai = calculateTai(winning, { selfDraw: false, ready: false, seat: 0, dealer: 0, eastSeat: 2, prevailingWind: 'w1', dealerStreak: 2 });
    expect(dealerTai.patterns).toEqual(expect.arrayContaining([{ id: 'dealer', tai: 1 }, { id: 'dealerStreak', tai: 4 }]));

    const waiting = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'p1', 'p2', 'p3', 's7', 's8', 's9', 'd1', 'd1', 'd1', 'w1'] as TileId[];
    const source = claimState(waiting, 'w1', 3);
    source.dealer = 3;
    source.dealerStreak = 2;
    const pending = discardTile(source, 0);
    const won = claimDiscard(pending, pending.claimOptions.findIndex((option) => option.kind === 'win'));
    expect(won.settlement).toMatchObject({ tai: 7, deltas: [1_900, 0, 0, -1_900] });
    expect(won.settlement?.patterns).toEqual(expect.arrayContaining([{ id: 'dealer', tai: 1 }, { id: 'dealerStreak', tai: 4 }]));
  });

  it('awards exactly one tai when the matching fixed seat calls the prevailing wind', () => {
    const concealed = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'p1', 'p2', 'p3', 's1', 's2', 's3', 'd1', 'd1'] as TileId[];
    for (const [windIndex, prevailingWind] of (['w1', 'w2', 'w3', 'w4'] as const).entries()) {
      for (const kind of ['pong', 'kong'] as const) {
        const windHand = hand(concealed);
        windHand.melds.push({ kind, tiles: Array.from({ length: kind === 'pong' ? 3 : 4 }, () => prevailingWind), fromPlayer: 1, concealed: false });
        const matchingSeat = (2 - windIndex + 4) % 4;
        const matchingResult = calculateTai(windHand, { selfDraw: false, ready: false, seat: matchingSeat, dealer: 0, eastSeat: 2, prevailingWind, dealerStreak: 0 });
        const otherResult = calculateTai(windHand, { selfDraw: false, ready: false, seat: (matchingSeat + 1) % 4, dealer: 0, eastSeat: 2, prevailingWind, dealerStreak: 0 });
        expect(matchingResult.patterns.filter((pattern) => pattern.id === 'roundSeatWind')).toEqual([{ id: 'roundSeatWind', tai: 1 }]);
        expect(otherResult.patterns.some((pattern) => pattern.id === 'roundSeatWind')).toBe(false);
      }
    }
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
    expect(won.players[3].discards).toEqual(['w1']);
    expect(won.pendingDiscard).toBeNull();
    expect(won.lastTileFocus).toEqual({ area: 'win', seat: 0, riverSeat: 3, tile: 'w1' });
    expect(won.points).toEqual([26_100, 25_000, 25_000, 23_900]);
    expect(won.settlement).toMatchObject({ tai: 3, deltas: [1_100, 0, 0, -1_100] });
  });

  it('records a self-drawn winning tile in the winner area', () => {
    const waiting = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'p1', 'p2', 'p3', 's7', 's8', 's9', 'd1', 'd1', 'd1', 'w1'] as TileId[];
    const state = claimState([], 'p9', 0);
    state.currentPlayer = 0;
    state.players[0] = hand(['p9']);
    state.players[3] = hand(waiting);
    state.wall = [...Array.from({ length: 9 }, () => 'm9' as TileId), 'w1'];

    const won = discardTile(state, 0);

    expect(won).toMatchObject({ winner: 3, winnerBy: 'selfDraw', loser: null });
    expect(won.lastTileFocus).toEqual({ area: 'win', seat: 3, riverSeat: 3, tile: 'w1' });
    expect(won.players[3].concealed.at(-1)).toBe('w1');
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
