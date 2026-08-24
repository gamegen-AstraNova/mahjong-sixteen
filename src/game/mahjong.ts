export type Suit = 'm' | 'p' | 's';
export type TileId = `${Suit}${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}` | `w${1 | 2 | 3 | 4}` | `d${1 | 2 | 3}` | `f${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`;
export type WindTile = `w${1 | 2 | 3 | 4}`;
export type MeldKind = 'chi' | 'pong' | 'kong';
export type ClaimKind = 'win' | MeldKind;

export interface Meld { kind: MeldKind; tiles: TileId[]; fromPlayer: number | null; concealed: boolean; }
export interface PlayerHand { concealed: TileId[]; flowers: TileId[]; discards: TileId[]; melds: Meld[]; }
export interface ClaimOption { kind: ClaimKind; consume: TileId[]; tiles: TileId[]; }
export interface TaiPattern { id: string; tai: number; }
export interface TaiResult { total: number; patterns: TaiPattern[]; }
export interface HandSettlement { reason: 'win' | 'draw'; tai: number; patterns: TaiPattern[]; deltas: number[]; bankruptPlayer: number | null; }
export interface RoundProgress { dealer: number; handNumber: number; dealerStreak: number; eastSeat?: number; prevailingWind?: WindTile; }
export interface WaitingTileInfo { tile: TileId; remaining: number; }
export interface GameplayTuning {
  favoredPlayer: number | null;
  drawAssistChance: number;
  drawCandidateCount: number;
  aiDiscardMistakeChance: number;
}
export type LastTileFocus =
  | { area: 'river'; seat: number; tile: TileId }
  | { area: 'meld'; seat: number; tile: TileId; meldIndex: number; tileIndex: number }
  | { area: 'win'; seat: number; riverSeat: number; tile: TileId };
export interface MahjongState {
  players: PlayerHand[]; wall: TileId[]; currentPlayer: number;
  winner: number | null; winnerBy: 'selfDraw' | 'discard' | null; loser: number | null; exhausted: boolean;
  phase: 'discard' | 'claim'; pendingDiscard: { player: number; tile: TileId } | null; claimOptions: ClaimOption[];
  lastDrawn: TileId | null; lastTileFocus: LastTileFocus | null;
  points: number[]; readyDeclared: boolean[]; settlement: HandSettlement | null;
  dealer: number; eastSeat: number; prevailingWind: WindTile; handNumber: number; dealerStreak: number; circleComplete: boolean; matchComplete: boolean;
}

export const INITIAL_POINTS = 25_000;
export const BASE_PAYMENT = 500;
export const PAYMENT_PER_TAI = 200;
export const TURN_TIME_SECONDS = 15;
export const STANDARD_GAMEPLAY_TUNING: Readonly<GameplayTuning> = Object.freeze({ favoredPlayer: null, drawAssistChance: 0, drawCandidateCount: 1, aiDiscardMistakeChance: 0 });
export const SINGLE_PLAYER_TUNING: Readonly<GameplayTuning> = Object.freeze({ favoredPlayer: 0, drawAssistChance: 0.45, drawCandidateCount: 3, aiDiscardMistakeChance: 0.3 });

const SUITED: TileId[] = (['m', 'p', 's'] as const).flatMap((suit) => Array.from({ length: 9 }, (_, index) => `${suit}${index + 1}` as TileId));
const WINDS: WindTile[] = Array.from({ length: 4 }, (_, index) => `w${index + 1}` as WindTile);
const DRAGONS: TileId[] = Array.from({ length: 3 }, (_, index) => `d${index + 1}` as TileId);
const FLOWERS: TileId[] = Array.from({ length: 8 }, (_, index) => `f${index + 1}` as TileId);
export const STANDARD_TILE_TYPES: TileId[] = [...SUITED, ...WINDS, ...DRAGONS];
const tileOrder = new Map<TileId, number>([...STANDARD_TILE_TYPES, ...FLOWERS].map((tile, index) => [tile, index]));
interface ShapeMeld { kind: 'sequence' | 'triplet'; tiles: TileId[]; }
interface WinningShape { pair: TileId; melds: ShapeMeld[]; }

export function isFlower(tile: TileId): boolean { return tile.startsWith('f'); }
export function sortTiles(tiles: TileId[]): TileId[] { return [...tiles].sort((a, b) => (tileOrder.get(a) ?? 999) - (tileOrder.get(b) ?? 999)); }
export function createSeededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => { value += 0x6d2b79f5; let next = value; next = Math.imul(next ^ (next >>> 15), next | 1); next ^= next + Math.imul(next ^ (next >>> 7), next | 61); return ((next ^ (next >>> 14)) >>> 0) / 4294967296; };
}
function shuffleTiles<T>(tiles: T[], random: () => number): T[] {
  for (let index = tiles.length - 1; index > 0; index -= 1) { const swap = Math.floor(random() * (index + 1)); [tiles[index], tiles[swap]] = [tiles[swap], tiles[index]]; }
  return tiles;
}
export function createWall(random: () => number = Math.random): TileId[] {
  const wall: TileId[] = [];
  STANDARD_TILE_TYPES.forEach((tile) => { for (let copy = 0; copy < 4; copy += 1) wall.push(tile); });
  wall.push(...FLOWERS); return shuffleTiles(wall, random);
}
function readyPotential(tiles: TileId[], openMeldCount: number): number {
  if (tiles.length % 3 !== 2) return 0;
  const waits = new Set<TileId>();
  tiles.forEach((_, discardIndex) => {
    const afterDiscard = tiles.filter((__, index) => index !== discardIndex);
    STANDARD_TILE_TYPES.forEach((candidate) => {
      if (countTile(afterDiscard, candidate) < 4 && isWinningHand([...afterDiscard, candidate], openMeldCount)) waits.add(candidate);
    });
  });
  return waits.size;
}

function assistedDrawIndex(wall: TileId[], hand: PlayerHand, candidateCount: number): number {
  const candidates: number[] = [];
  for (let index = wall.length - 1; index >= 8 && candidates.length < candidateCount; index -= 1) {
    if (!isFlower(wall[index])) candidates.push(index);
  }
  const scored = candidates.map((index) => {
    const tile = wall[index];
    const prospective = [...hand.concealed, tile];
    const winning = isWinningHand(prospective, hand.melds.length);
    return { index, score: Number(winning) * 100_000 + readyPotential(prospective, hand.melds.length) * 1_000 + tileValue(tile, prospective) };
  });
  scored.sort((a, b) => b.score - a.score || b.index - a.index);
  return scored[0]?.index ?? wall.length - 1;
}

function drawReplacement(wall: TileId[], hand: PlayerHand, assisted: boolean, tuning: Readonly<GameplayTuning>, random: () => number): TileId | null {
  while (wall.length > 8) {
    const top = wall.at(-1) ?? null;
    if (!top) return null;
    if (isFlower(top)) { hand.flowers.push(wall.pop()!); continue; }
    const useAssist = assisted && tuning.drawCandidateCount > 1 && random() < tuning.drawAssistChance;
    const index = useAssist ? assistedDrawIndex(wall, hand, tuning.drawCandidateCount) : wall.length - 1;
    return wall.splice(index, 1)[0] ?? null;
  }
  return null;
}

function enumerateMelds(counts: number[], needed: number, path: ShapeMeld[], results: ShapeMeld[][]): void {
  if (needed === 0) { if (counts.every((count) => count === 0)) results.push(path.map((meld) => ({ ...meld, tiles: [...meld.tiles] }))); return; }
  const first = counts.findIndex((count) => count > 0); if (first < 0) return;
  const tile = STANDARD_TILE_TYPES[first];
  if (counts[first] >= 3) { counts[first] -= 3; path.push({ kind: 'triplet', tiles: [tile, tile, tile] }); enumerateMelds(counts, needed - 1, path, results); path.pop(); counts[first] += 3; }
  const rank = first % 9;
  if (first < 27 && rank <= 6 && counts[first + 1] > 0 && counts[first + 2] > 0) {
    counts[first] -= 1; counts[first + 1] -= 1; counts[first + 2] -= 1;
    path.push({ kind: 'sequence', tiles: [tile, STANDARD_TILE_TYPES[first + 1], STANDARD_TILE_TYPES[first + 2]] });
    enumerateMelds(counts, needed - 1, path, results); path.pop(); counts[first] += 1; counts[first + 1] += 1; counts[first + 2] += 1;
  }
}
function winningShapes(tiles: TileId[], openMelds = 0): WinningShape[] {
  const needed = 5 - openMelds;
  if (needed < 0 || tiles.length !== needed * 3 + 2 || tiles.some(isFlower)) return [];
  const counts = Array.from({ length: STANDARD_TILE_TYPES.length }, () => 0);
  for (const tile of tiles) { const index = STANDARD_TILE_TYPES.indexOf(tile); if (index < 0) return []; counts[index] += 1; }
  const shapes: WinningShape[] = [];
  for (let pair = 0; pair < counts.length; pair += 1) {
    if (counts[pair] < 2) continue; counts[pair] -= 2; const sets: ShapeMeld[][] = []; enumerateMelds(counts, needed, [], sets); counts[pair] += 2;
    sets.forEach((melds) => shapes.push({ pair: STANDARD_TILE_TYPES[pair], melds }));
  }
  return shapes;
}
export function isWinningHand(tiles: TileId[], openMeldCount = 0): boolean { return winningShapes(tiles, openMeldCount).length > 0; }
function countTile(tiles: TileId[], target: TileId): number { return tiles.reduce((count, tile) => count + Number(tile === target), 0); }

function dealerBonusPatterns(dealerStreak: number): TaiPattern[] {
  return [
    { id: 'dealer', tai: 1 },
    ...(dealerStreak > 0 ? [{ id: 'dealerStreak', tai: dealerStreak * 2 }] : []),
  ];
}

export function seatWindForPlayer(player: number, eastSeat: number): WindTile {
  const normalizedPlayer = ((player % 4) + 4) % 4;
  const normalizedEastSeat = ((eastSeat % 4) + 4) % 4;
  return WINDS[(normalizedEastSeat - normalizedPlayer + 4) % 4];
}

function scoreShape(hand: PlayerHand, shape: WinningShape, options: { selfDraw: boolean; ready: boolean; seat: number; dealer: number; eastSeat: number; prevailingWind: WindTile; dealerStreak: number }): TaiResult {
  // The base stake is handled by BASE_PAYMENT and is not counted as a tai.
  const patterns: TaiPattern[] = [];
  const closed = hand.melds.every((meld) => meld.concealed);
  if (closed && options.selfDraw) patterns.push({ id: 'closedSelfDrawBonus', tai: 3 });
  else {
    if (options.selfDraw) patterns.push({ id: 'selfDraw', tai: 1 });
    if (closed) patterns.push({ id: 'closed', tai: 1 });
  }
  if (options.ready) patterns.push({ id: 'ready', tai: 1 });
  if (hand.flowers.length) patterns.push({ id: 'flowers', tai: hand.flowers.length });
  const melds = [...shape.melds, ...hand.melds.map((meld) => ({ kind: meld.kind === 'chi' ? 'sequence' as const : 'triplet' as const, tiles: meld.tiles }))];
  if (melds.every((meld) => meld.kind === 'triplet')) patterns.push({ id: 'allTriplets', tai: 4 });
  const allTiles = [...hand.concealed, ...hand.melds.flatMap((meld) => meld.tiles)].filter((tile) => !isFlower(tile));
  const suits = new Set(allTiles.filter((tile) => /^[mps]/u.test(tile)).map((tile) => tile[0]));
  const honors = allTiles.some((tile) => /^[wd]/u.test(tile));
  if (suits.size === 0 && honors) patterns.push({ id: 'allHonors', tai: 16 });
  else if (suits.size === 1 && honors) patterns.push({ id: 'halfFlush', tai: 4 });
  else if (suits.size === 1 && !honors) patterns.push({ id: 'fullFlush', tai: 8 });
  const triplets = new Set(melds.filter((meld) => meld.kind === 'triplet').map((meld) => meld.tiles[0]));
  const dragonSets = DRAGONS.filter((tile) => triplets.has(tile));
  if (dragonSets.length === 3) patterns.push({ id: 'bigThreeDragons', tai: 8 });
  else if (dragonSets.length === 2 && DRAGONS.includes(shape.pair)) patterns.push({ id: 'smallThreeDragons', tai: 4 });
  else dragonSets.forEach((tile) => patterns.push({ id: tile === 'd1' ? 'redDragon' : tile === 'd2' ? 'greenDragon' : 'whiteDragon', tai: 1 }));
  const prevailingWindCall = hand.melds.some((meld) => (meld.kind === 'pong' || meld.kind === 'kong') && meld.tiles[0] === options.prevailingWind);
  if (seatWindForPlayer(options.seat, options.eastSeat) === options.prevailingWind && prevailingWindCall) patterns.push({ id: 'roundSeatWind', tai: 1 });
  if (options.seat === options.dealer) patterns.push(...dealerBonusPatterns(options.dealerStreak));
  return { total: patterns.reduce((sum, pattern) => sum + pattern.tai, 0), patterns };
}
export function calculateTai(hand: PlayerHand, options: { selfDraw: boolean; ready: boolean; seat: number; dealer: number; eastSeat: number; prevailingWind: WindTile; dealerStreak: number }): TaiResult {
  const results = winningShapes(hand.concealed, hand.melds.length).map((shape) => scoreShape(hand, shape, options));
  return results.sort((a, b) => b.total - a.total)[0] ?? { total: 0, patterns: [] };
}

function applyWinSettlement(state: MahjongState, winner: number, by: 'selfDraw' | 'discard', loser: number | null, winningTile?: TileId): void {
  const scoringHand = structuredClone(state.players[winner]); if (winningTile) scoringHand.concealed.push(winningTile);
  const result = calculateTai(scoringHand, {
    selfDraw: by === 'selfDraw',
    ready: state.readyDeclared[winner],
    seat: winner,
    dealer: state.dealer,
    eastSeat: state.eastSeat,
    prevailingWind: state.prevailingWind,
    dealerStreak: state.dealerStreak,
  });
  const dealerBonus = dealerBonusPatterns(state.dealerStreak);
  const dealerBonusTai = dealerBonus.reduce((sum, pattern) => sum + pattern.tai, 0);
  const dealerPaysWinner = winner !== state.dealer && (by === 'selfDraw' || loser === state.dealer);
  const settlementPatterns = dealerPaysWinner ? [...result.patterns, ...dealerBonus] : result.patterns;
  const settlementTai = result.total + (dealerPaysWinner ? dealerBonusTai : 0);
  const deltas = [0, 0, 0, 0];
  const charge = (payer: number, requested: number) => { const actual = Math.min(state.points[payer], requested); deltas[payer] -= actual; deltas[winner] += actual; };
  const chargePlayer = (payer: number) => {
    const tai = result.total + (winner !== state.dealer && payer === state.dealer ? dealerBonusTai : 0);
    charge(payer, BASE_PAYMENT + tai * PAYMENT_PER_TAI);
  };
  if (by === 'selfDraw') for (let player = 0; player < 4; player += 1) { if (player !== winner) chargePlayer(player); }
  else if (loser !== null) chargePlayer(loser);
  state.points = state.points.map((points, index) => Math.max(0, points + deltas[index]));
  state.winner = winner; state.winnerBy = by; state.loser = loser; state.phase = 'discard'; state.claimOptions = [];
  const settlementTile = winningTile ?? state.lastDrawn;
  if (settlementTile) state.lastTileFocus = { area: 'win', seat: winner, riverSeat: by === 'discard' && loser !== null ? loser : winner, tile: settlementTile };
  const bankrupt = state.points.findIndex((points) => points === 0);
  state.settlement = { reason: 'win', tai: settlementTai, patterns: settlementPatterns, deltas, bankruptPlayer: bankrupt < 0 ? null : bankrupt };
  state.circleComplete = winner !== state.dealer && state.handNumber >= 3;
  state.matchComplete = bankrupt >= 0 || (state.circleComplete && state.prevailingWind === 'w4');
}

export function createInitialState(
  random: () => number = Math.random,
  initialPoints: number[] = Array.from({ length: 4 }, () => INITIAL_POINTS),
  round: RoundProgress = { dealer: 0, handNumber: 0, dealerStreak: 0 },
): MahjongState {
  const eastSeat = round.eastSeat ?? Math.floor(random() * 4);
  const prevailingWind = round.prevailingWind ?? 'w1';
  const shuffled = createWall(random); const dealPool = shuffled.filter((tile) => !isFlower(tile)); const flowers = shuffled.filter(isFlower);
  const players: PlayerHand[] = Array.from({ length: 4 }, () => ({ concealed: [], flowers: [], discards: [], melds: [] }));
  for (let round = 0; round < 16; round += 1) players.forEach((hand) => { const tile = dealPool.pop(); if (tile) hand.concealed.push(tile); });
  players.forEach((hand) => { hand.concealed = sortTiles(hand.concealed); });
  const dealerTile = dealPool.pop() ?? null; if (dealerTile) players[round.dealer].concealed.push(dealerTile);
  const state: MahjongState = {
    players, wall: shuffleTiles([...dealPool, ...flowers], random), currentPlayer: round.dealer, winner: null, winnerBy: null, loser: null, exhausted: false,
    phase: 'discard', pendingDiscard: null, claimOptions: [], lastDrawn: dealerTile, lastTileFocus: null,
    points: initialPoints.map((points) => Math.max(0, Math.floor(points))), readyDeclared: [false, false, false, false], settlement: null,
    dealer: round.dealer, eastSeat, prevailingWind, handNumber: round.handNumber, dealerStreak: round.dealerStreak, circleComplete: false, matchComplete: false,
  };
  if (isWinningHand(players[round.dealer].concealed)) applyWinSettlement(state, round.dealer, 'selfDraw', null);
  return state;
}

export function startNextHand(source: MahjongState, random: () => number = Math.random): MahjongState {
  if (!source.settlement || source.matchComplete) return source;
  const dealerRetains = source.settlement.reason === 'draw' || source.winner === source.dealer;
  const nextDealer = dealerRetains ? source.dealer : nextPlayer(source.dealer);
  const nextPrevailingWind = source.circleComplete ? WINDS[WINDS.indexOf(source.prevailingWind) + 1] : source.prevailingWind;
  return createInitialState(random, source.points, {
    dealer: nextDealer,
    eastSeat: source.eastSeat,
    prevailingWind: nextPrevailingWind,
    handNumber: source.circleComplete ? 0 : dealerRetains ? source.handNumber : source.handNumber + 1,
    dealerStreak: dealerRetains ? source.dealerStreak + 1 : 0,
  });
}

function chiOptions(hand: TileId[], tile: TileId): ClaimOption[] {
  if (!/^[mps][1-9]$/u.test(tile)) return [];
  const suit = tile[0] as Suit; const rank = Number(tile[1]); const options: ClaimOption[] = [];
  for (const start of [rank - 2, rank - 1, rank]) {
    if (start < 1 || start > 7) continue;
    const sequence = [start, start + 1, start + 2].map((value) => `${suit}${value}` as TileId); const consume = sequence.filter((candidate) => candidate !== tile);
    if (consume.every((candidate) => countTile(hand, candidate) >= countTile(consume, candidate))) options.push({ kind: 'chi', consume, tiles: sequence });
  }
  return options;
}
export function getClaimOptions(state: MahjongState, playerIndex: number): ClaimOption[] {
  const pending = state.pendingDiscard; if (!pending || playerIndex === pending.player) return [];
  const hand = state.players[playerIndex]; const tile = pending.tile; const options: ClaimOption[] = [];
  if (isWinningHand([...hand.concealed, tile], hand.melds.length)) options.push({ kind: 'win', consume: [], tiles: [tile] });
  if (state.readyDeclared[playerIndex]) return options;
  const copies = countTile(hand.concealed, tile);
  if (copies >= 3 && state.wall.length > 8) options.push({ kind: 'kong', consume: [tile, tile, tile], tiles: [tile, tile, tile, tile] });
  if (copies >= 2) options.push({ kind: 'pong', consume: [tile, tile], tiles: [tile, tile, tile] });
  if (playerIndex === nextPlayer(pending.player)) options.push(...chiOptions(hand.concealed, tile));
  return options;
}
function removeTiles(hand: TileId[], targets: TileId[]) { targets.forEach((target) => { const index = hand.indexOf(target); if (index >= 0) hand.splice(index, 1); }); }
function finishDiscardWin(state: MahjongState, player: number) {
  const pending = state.pendingDiscard;
  if (!pending) return;
  applyWinSettlement(state, player, 'discard', pending.player, pending.tile);
  state.pendingDiscard = null;
}
function finishDraw(state: MahjongState) {
  state.exhausted = true; state.lastDrawn = null; const bankrupt = state.points.findIndex((points) => points === 0);
  state.settlement = { reason: 'draw', tai: 0, patterns: [], deltas: [0, 0, 0, 0], bankruptPlayer: bankrupt < 0 ? null : bankrupt };
  state.circleComplete = false;
  state.matchComplete = bankrupt >= 0;
}
function drawForPlayer(state: MahjongState, player: number, tuning: Readonly<GameplayTuning> = STANDARD_GAMEPLAY_TUNING, random: () => number = Math.random) {
  const hand = state.players[player]; const assisted = tuning.favoredPlayer === player;
  const drawn = drawReplacement(state.wall, hand, assisted, tuning, random); if (!drawn) { finishDraw(state); return; }
  hand.concealed.push(drawn); state.lastDrawn = drawn;
  if (isWinningHand(hand.concealed, hand.melds.length)) applyWinSettlement(state, player, 'selfDraw', null);
}
function advanceAfterDiscard(state: MahjongState, tuning: Readonly<GameplayTuning> = STANDARD_GAMEPLAY_TUNING, random: () => number = Math.random) {
  const discarder = state.pendingDiscard?.player ?? state.currentPlayer; state.pendingDiscard = null; state.claimOptions = []; state.phase = 'discard'; state.currentPlayer = nextPlayer(discarder); drawForPlayer(state, state.currentPlayer, tuning, random);
}
function applyMeldClaim(state: MahjongState, player: number, option: ClaimOption, tuning: Readonly<GameplayTuning> = STANDARD_GAMEPLAY_TUNING, random: () => number = Math.random) {
  const pending = state.pendingDiscard; if (!pending) return; const hand = state.players[player]; removeTiles(hand.concealed, option.consume);
  const pile = state.players[pending.player].discards; if (pile.at(-1) === pending.tile) pile.pop();
  const meldIndex = hand.melds.length;
  const meldTiles = option.kind === 'chi'
    ? (() => { const companions = sortTiles(option.consume); return [companions[0], pending.tile, companions[1]]; })()
    : [...option.tiles];
  const tileIndex = Math.max(0, meldTiles.indexOf(pending.tile));
  hand.melds.push({ kind: option.kind as MeldKind, tiles: meldTiles, fromPlayer: pending.player, concealed: false }); hand.concealed = sortTiles(hand.concealed);
  state.lastTileFocus = { area: 'meld', seat: player, tile: pending.tile, meldIndex, tileIndex };
  state.currentPlayer = player; state.pendingDiscard = null; state.claimOptions = []; state.phase = 'discard'; state.lastDrawn = null; if (option.kind === 'kong') drawForPlayer(state, player, tuning, random);
}
function nextPlayer(player: number): number { return (player + 3) % 4; }
function counterclockwisePlayers(discarder: number): number[] { return [1, 2, 3].map((offset) => (discarder - offset + 4) % 4); }
function resolvePendingClaims(state: MahjongState, skipped: Set<number> = new Set(), tuning: Readonly<GameplayTuning> = STANDARD_GAMEPLAY_TUNING, random: () => number = Math.random) {
  const pending = state.pendingDiscard; if (!pending) return;
  const ordered = counterclockwisePlayers(pending.player).filter((player) => !skipped.has(player)); const byPlayer = new Map(ordered.map((player) => [player, getClaimOptions(state, player)]));
  const winner = ordered.find((player) => byPlayer.get(player)?.some((option) => option.kind === 'win'));
  if (winner !== undefined) { if (winner === 0) { state.currentPlayer = 0; state.phase = 'claim'; state.claimOptions = byPlayer.get(0)!.filter((option) => option.kind === 'win'); } else finishDiscardWin(state, winner); return; }
  const setPlayer = ordered.find((player) => byPlayer.get(player)?.some((option) => option.kind === 'kong' || option.kind === 'pong'));
  if (setPlayer !== undefined) { const options = byPlayer.get(setPlayer)!.filter((option) => option.kind === 'kong' || option.kind === 'pong'); if (setPlayer === 0) { state.currentPlayer = 0; state.phase = 'claim'; state.claimOptions = options; } else applyMeldClaim(state, setPlayer, options.find((option) => option.kind === 'kong') ?? options[0], tuning, random); return; }
  const next = nextPlayer(pending.player);
  if (!skipped.has(next)) { const options = (byPlayer.get(next) ?? []).filter((option) => option.kind === 'chi'); if (options.length) { if (next === 0) { state.currentPlayer = 0; state.phase = 'claim'; state.claimOptions = options; } else applyMeldClaim(state, next, options[0], tuning, random); return; } }
  advanceAfterDiscard(state, tuning, random);
}

function tileValue(tile: TileId, hand: TileId[]): number {
  let value = countTile(hand, tile) * 4;
  if (/^[mps]/u.test(tile)) { const suit = tile[0]; const rank = Number(tile[1]); for (const distance of [-2, -1, 1, 2]) { const neighbor = `${suit}${rank + distance}` as TileId; if (rank + distance >= 1 && rank + distance <= 9 && hand.includes(neighbor)) value += Math.abs(distance) === 1 ? 2 : 1; } }
  return value;
}
export function chooseAiDiscard(hand: TileId[], random: () => number = Math.random, mistakeChance = 0): number {
  const makeMistake = mistakeChance > 0 && random() < mistakeChance;
  const scored = hand.map((tile, index) => ({ index, value: tileValue(tile, hand), tie: random() })); scored.sort((a, b) => a.value - b.value || a.tie - b.tie);
  if (!makeMistake || scored.length < 2) return scored[0]?.index ?? 0;
  const alternativeCount = Math.max(1, Math.ceil(scored.length / 2) - 1);
  return scored[1 + Math.floor(random() * alternativeCount)]?.index ?? scored[0]?.index ?? 0;
}
export function readyDiscardIndices(state: MahjongState, player: number): number[] {
  if (state.phase !== 'discard' || state.currentPlayer !== player || state.winner !== null || state.exhausted || state.readyDeclared[player]) return [];
  const hand = state.players[player]; const results: number[] = [];
  hand.concealed.forEach((_, index) => { const after = hand.concealed.filter((__, tileIndex) => tileIndex !== index); if (STANDARD_TILE_TYPES.some((candidate) => countTile(after, candidate) < 4 && isWinningHand([...after, candidate], hand.melds.length))) results.push(index); });
  return results;
}
export function waitingTiles(state: MahjongState, player: number): WaitingTileInfo[] {
  const hand = state.players[player];
  if (!state.readyDeclared[player]) return [];
  const concealed = [...hand.concealed];
  if (concealed.length % 3 === 2 && state.currentPlayer === player && state.lastDrawn !== null) {
    const drawnIndex = concealed.lastIndexOf(state.lastDrawn);
    if (drawnIndex >= 0) concealed.splice(drawnIndex, 1);
  }
  if (concealed.length % 3 !== 1) return [];
  const publiclyVisible = state.players.flatMap((candidate) => [
    ...candidate.discards,
    ...candidate.flowers,
    ...candidate.melds.flatMap((meld) => meld.tiles),
  ]);
  return STANDARD_TILE_TYPES.flatMap((tile) => {
    if (!isWinningHand([...concealed, tile], hand.melds.length)) return [];
    const visible = countTile(hand.concealed, tile) + countTile(publiclyVisible, tile);
    return [{ tile, remaining: Math.max(0, 4 - visible) }];
  });
}
function discardTileAwaitingInternal(source: MahjongState, player: number, tileIndex: number, declaringReady: boolean): MahjongState {
  if (source.winner !== null || source.exhausted || source.phase !== 'discard' || source.currentPlayer !== player) return source;
  const state = structuredClone(source); const hand = state.players[player];
  if (!declaringReady && state.readyDeclared[player] && tileIndex !== hand.concealed.length - 1) return source;
  const [discarded] = hand.concealed.splice(tileIndex, 1); if (!discarded) return source;
  hand.concealed = sortTiles(hand.concealed); hand.discards.push(discarded); state.lastDrawn = null;
  state.lastTileFocus = { area: 'river', seat: player, tile: discarded };
  state.pendingDiscard = { player, tile: discarded }; state.phase = 'claim'; state.claimOptions = []; return state;
}
export function discardTileAwaitingClaims(source: MahjongState, player: number, tileIndex: number): MahjongState {
  return discardTileAwaitingInternal(source, player, tileIndex, false);
}
export function declareReadyAwaitingClaims(source: MahjongState, player: number, tileIndex: number): MahjongState {
  if (source.currentPlayer !== player || !readyDiscardIndices(source, player).includes(tileIndex)) return source;
  const state = structuredClone(source); state.readyDeclared[player] = true; return discardTileAwaitingInternal(state, player, tileIndex, true);
}
export function claimDiscardForPlayer(source: MahjongState, player: number, optionIndex: number): MahjongState {
  if (!source.pendingDiscard) return source;
  const option = getClaimOptions(source, player)[optionIndex]; if (!option) return source;
  const state = structuredClone(source); if (option.kind === 'win') finishDiscardWin(state, player); else applyMeldClaim(state, player, option); return state;
}
export function advanceAfterAllPasses(source: MahjongState, tuning: Readonly<GameplayTuning> = STANDARD_GAMEPLAY_TUNING, random: () => number = Math.random): MahjongState {
  if (!source.pendingDiscard) return source;
  const state = structuredClone(source); advanceAfterDiscard(state, tuning, random); return state;
}
function discardTileInternal(source: MahjongState, tileIndex: number, declaringReady: boolean, tuning: Readonly<GameplayTuning>, random: () => number): MahjongState {
  const state = discardTileAwaitingInternal(source, source.currentPlayer, tileIndex, declaringReady);
  if (state === source) return source;
  resolvePendingClaims(state, new Set(), tuning, random); return state;
}
export function discardTile(source: MahjongState, tileIndex: number, tuning: Readonly<GameplayTuning> = STANDARD_GAMEPLAY_TUNING, random: () => number = Math.random): MahjongState { return discardTileInternal(source, tileIndex, false, tuning, random); }
export function declareReady(source: MahjongState, tileIndex: number, tuning: Readonly<GameplayTuning> = STANDARD_GAMEPLAY_TUNING, random: () => number = Math.random): MahjongState {
  if (!readyDiscardIndices(source, source.currentPlayer).includes(tileIndex)) return source; const state = structuredClone(source); state.readyDeclared[state.currentPlayer] = true; return discardTileInternal(state, tileIndex, true, tuning, random);
}
export function claimDiscard(source: MahjongState, optionIndex: number, tuning: Readonly<GameplayTuning> = STANDARD_GAMEPLAY_TUNING, random: () => number = Math.random): MahjongState {
  if (source.phase !== 'claim' || source.currentPlayer !== 0 || !source.pendingDiscard) return source; const option = source.claimOptions[optionIndex]; if (!option) return source;
  const state = structuredClone(source); if (option.kind === 'win') finishDiscardWin(state, 0); else applyMeldClaim(state, 0, option, tuning, random); return state;
}
export function passClaim(source: MahjongState, tuning: Readonly<GameplayTuning> = STANDARD_GAMEPLAY_TUNING, random: () => number = Math.random): MahjongState {
  if (source.phase !== 'claim' || source.currentPlayer !== 0 || !source.pendingDiscard) return source; const state = structuredClone(source); state.claimOptions = []; resolvePendingClaims(state, new Set([0]), tuning, random); return state;
}
export function autoPlayCurrentTurn(source: MahjongState, random: () => number = Math.random, tuning: Readonly<GameplayTuning> = STANDARD_GAMEPLAY_TUNING): MahjongState {
  if (source.winner !== null || source.exhausted) return source;
  if (source.phase === 'claim' && source.currentPlayer === 0) { const win = source.claimOptions.findIndex((option) => option.kind === 'win'); return win >= 0 ? claimDiscard(source, win, tuning, random) : passClaim(source, tuning, random); }
  if (source.phase !== 'discard') return source; const hand = source.players[source.currentPlayer]?.concealed ?? [];
  if (source.readyDeclared[source.currentPlayer]) return discardTile(source, hand.length - 1, tuning, random);
  const kongs = kongTiles(source, source.currentPlayer); if (kongs.length) return declareKong(source, kongs[0], tuning, random);
  const ready = readyDiscardIndices(source, source.currentPlayer); if (ready.length) return declareReady(source, ready[Math.floor(random() * ready.length)] ?? ready[0], tuning, random);
  const aiMistakeChance = tuning.favoredPlayer !== null && source.currentPlayer !== tuning.favoredPlayer ? tuning.aiDiscardMistakeChance : 0;
  return discardTile(source, chooseAiDiscard(hand, random, aiMistakeChance), tuning, random);
}
export function kongTiles(state: MahjongState, player: number): TileId[] {
  if (state.phase !== 'discard' || state.currentPlayer !== player || state.wall.length <= 8 || state.readyDeclared[player]) return [];
  const hand = state.players[player];
  return STANDARD_TILE_TYPES.filter((tile) => {
    const concealedCopies = countTile(hand.concealed, tile);
    const exposedPong = hand.melds.some((meld) => !meld.concealed && meld.kind === 'pong' && meld.tiles[0] === tile);
    return concealedCopies === 4 || (concealedCopies >= 1 && exposedPong);
  });
}
export function declareKong(source: MahjongState, tile: TileId, tuning: Readonly<GameplayTuning> = STANDARD_GAMEPLAY_TUNING, random: () => number = Math.random): MahjongState {
  const player = source.currentPlayer; if (!kongTiles(source, player).includes(tile)) return source; const state = structuredClone(source); const hand = state.players[player];
  const exposedPongIndex = hand.melds.findIndex((meld) => !meld.concealed && meld.kind === 'pong' && meld.tiles[0] === tile);
  const exposedPong = hand.melds[exposedPongIndex];
  if (exposedPong) {
    removeTiles(hand.concealed, [tile]);
    exposedPong.kind = 'kong';
    exposedPong.tiles.push(tile);
    state.lastTileFocus = { area: 'meld', seat: player, tile, meldIndex: exposedPongIndex, tileIndex: exposedPong.tiles.length - 1 };
  } else {
    removeTiles(hand.concealed, [tile, tile, tile, tile]);
    hand.melds.push({ kind: 'kong', tiles: [tile, tile, tile, tile], fromPlayer: null, concealed: true });
    state.lastTileFocus = { area: 'meld', seat: player, tile, meldIndex: hand.melds.length - 1, tileIndex: 2 };
  }
  hand.concealed = sortTiles(hand.concealed); drawForPlayer(state, player, tuning, random); return state;
}
export const discardAndAdvance = discardTile;
export function tileLabel(tile: TileId): string {
  const suit = tile[0]; const rank = Number(tile.slice(1)); if (suit === 'm') return `${rank}萬`; if (suit === 'p') return `${rank}筒`; if (suit === 's') return `${rank}索`;
  if (suit === 'w') return ['東', '南', '西', '北'][rank - 1] ?? tile; if (suit === 'd') return ['中', '發', '白'][rank - 1] ?? tile; return ['春', '夏', '秋', '冬', '梅', '蘭', '菊', '竹'][rank - 1] ?? tile;
}
