export type Suit = 'm' | 'p' | 's';
export type TileId = `${Suit}${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}` | `w${1 | 2 | 3 | 4}` | `d${1 | 2 | 3}` | `f${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`;
export type MeldKind = 'chi' | 'pong' | 'kong';
export type ClaimKind = 'win' | MeldKind;

export interface Meld { kind: MeldKind; tiles: TileId[]; fromPlayer: number | null; concealed: boolean; }
export interface PlayerHand { concealed: TileId[]; flowers: TileId[]; discards: TileId[]; melds: Meld[]; }
export interface ClaimOption { kind: ClaimKind; consume: TileId[]; tiles: TileId[]; }
export interface TaiPattern { id: string; tai: number; }
export interface TaiResult { total: number; patterns: TaiPattern[]; }
export interface HandSettlement { reason: 'win' | 'draw'; tai: number; patterns: TaiPattern[]; deltas: number[]; bankruptPlayer: number | null; }
export interface MahjongState {
  players: PlayerHand[]; wall: TileId[]; currentPlayer: number;
  winner: number | null; winnerBy: 'selfDraw' | 'discard' | null; loser: number | null; exhausted: boolean;
  phase: 'discard' | 'claim'; pendingDiscard: { player: number; tile: TileId } | null; claimOptions: ClaimOption[];
  lastDrawn: TileId | null; points: number[]; readyDeclared: boolean[]; settlement: HandSettlement | null;
}

export const INITIAL_POINTS = 25_000;
export const BASE_PAYMENT = 500;
export const PAYMENT_PER_TAI = 250;

const SUITED: TileId[] = (['m', 'p', 's'] as const).flatMap((suit) => Array.from({ length: 9 }, (_, index) => `${suit}${index + 1}` as TileId));
const WINDS: TileId[] = Array.from({ length: 4 }, (_, index) => `w${index + 1}` as TileId);
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
function drawReplacement(wall: TileId[], hand: PlayerHand): TileId | null {
  while (wall.length > 8) { const tile = wall.pop() ?? null; if (!tile) return null; if (isFlower(tile)) { hand.flowers.push(tile); continue; } return tile; }
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

function scoreShape(hand: PlayerHand, shape: WinningShape, options: { selfDraw: boolean; ready: boolean; seat: number }): TaiResult {
  // The base stake is handled by BASE_PAYMENT and is not counted as a tai.
  const patterns: TaiPattern[] = [];
  const closed = hand.melds.every((meld) => meld.concealed);
  if (options.selfDraw) patterns.push({ id: 'selfDraw', tai: 1 });
  if (closed) patterns.push({ id: 'closed', tai: 1 });
  if (closed && options.selfDraw) patterns.push({ id: 'closedSelfDrawBonus', tai: 1 });
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
  const seatWind = `w${options.seat + 1}` as TileId;
  if (triplets.has(seatWind)) patterns.push({ id: 'seatWind', tai: 1 });
  if (triplets.has('w1')) patterns.push({ id: 'roundWind', tai: 1 });
  return { total: patterns.reduce((sum, pattern) => sum + pattern.tai, 0), patterns };
}
export function calculateTai(hand: PlayerHand, options: { selfDraw: boolean; ready: boolean; seat: number }): TaiResult {
  const results = winningShapes(hand.concealed, hand.melds.length).map((shape) => scoreShape(hand, shape, options));
  return results.sort((a, b) => b.total - a.total)[0] ?? { total: 0, patterns: [] };
}

function applyWinSettlement(state: MahjongState, winner: number, by: 'selfDraw' | 'discard', loser: number | null, winningTile?: TileId): void {
  const scoringHand = structuredClone(state.players[winner]); if (winningTile) scoringHand.concealed.push(winningTile);
  const result = calculateTai(scoringHand, { selfDraw: by === 'selfDraw', ready: state.readyDeclared[winner], seat: winner });
  const payment = BASE_PAYMENT + result.total * PAYMENT_PER_TAI;
  const deltas = [0, 0, 0, 0];
  const charge = (payer: number, requested: number) => { const actual = Math.min(state.points[payer], requested); deltas[payer] -= actual; deltas[winner] += actual; };
  if (by === 'selfDraw') for (let player = 0; player < 4; player += 1) { if (player !== winner) charge(player, payment); }
  else if (loser !== null) charge(loser, payment * 3);
  state.points = state.points.map((points, index) => Math.max(0, points + deltas[index]));
  state.winner = winner; state.winnerBy = by; state.loser = loser; state.phase = 'discard'; state.claimOptions = [];
  const bankrupt = state.points.findIndex((points) => points === 0);
  state.settlement = { reason: 'win', tai: result.total, patterns: result.patterns, deltas, bankruptPlayer: bankrupt < 0 ? null : bankrupt };
}

export function createInitialState(random: () => number = Math.random, initialPoints: number[] = Array.from({ length: 4 }, () => INITIAL_POINTS)): MahjongState {
  const shuffled = createWall(random); const dealPool = shuffled.filter((tile) => !isFlower(tile)); const flowers = shuffled.filter(isFlower);
  const players: PlayerHand[] = Array.from({ length: 4 }, () => ({ concealed: [], flowers: [], discards: [], melds: [] }));
  for (let round = 0; round < 16; round += 1) players.forEach((hand) => { const tile = dealPool.pop(); if (tile) hand.concealed.push(tile); });
  players.forEach((hand) => { hand.concealed = sortTiles(hand.concealed); });
  const dealerTile = dealPool.pop() ?? null; if (dealerTile) players[0].concealed.push(dealerTile);
  const state: MahjongState = {
    players, wall: shuffleTiles([...dealPool, ...flowers], random), currentPlayer: 0, winner: null, winnerBy: null, loser: null, exhausted: false,
    phase: 'discard', pendingDiscard: null, claimOptions: [], lastDrawn: dealerTile,
    points: initialPoints.map((points) => Math.max(0, Math.floor(points))), readyDeclared: [false, false, false, false], settlement: null,
  };
  if (isWinningHand(players[0].concealed)) applyWinSettlement(state, 0, 'selfDraw', null);
  return state;
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
  if (playerIndex === (pending.player + 1) % 4) options.push(...chiOptions(hand.concealed, tile));
  return options;
}
function removeTiles(hand: TileId[], targets: TileId[]) { targets.forEach((target) => { const index = hand.indexOf(target); if (index >= 0) hand.splice(index, 1); }); }
function finishDiscardWin(state: MahjongState, player: number) { applyWinSettlement(state, player, 'discard', state.pendingDiscard?.player ?? null, state.pendingDiscard?.tile); }
function finishDraw(state: MahjongState) {
  state.exhausted = true; state.lastDrawn = null; const bankrupt = state.points.findIndex((points) => points === 0);
  state.settlement = { reason: 'draw', tai: 0, patterns: [], deltas: [0, 0, 0, 0], bankruptPlayer: bankrupt < 0 ? null : bankrupt };
}
function drawForPlayer(state: MahjongState, player: number) {
  const hand = state.players[player]; const drawn = drawReplacement(state.wall, hand); if (!drawn) { finishDraw(state); return; }
  hand.concealed.push(drawn); state.lastDrawn = drawn;
  if (isWinningHand(hand.concealed, hand.melds.length)) applyWinSettlement(state, player, 'selfDraw', null);
}
function advanceAfterDiscard(state: MahjongState) {
  const discarder = state.pendingDiscard?.player ?? state.currentPlayer; state.pendingDiscard = null; state.claimOptions = []; state.phase = 'discard'; state.currentPlayer = (discarder + 1) % 4; drawForPlayer(state, state.currentPlayer);
}
function applyMeldClaim(state: MahjongState, player: number, option: ClaimOption) {
  const pending = state.pendingDiscard; if (!pending) return; const hand = state.players[player]; removeTiles(hand.concealed, option.consume);
  const pile = state.players[pending.player].discards; if (pile.at(-1) === pending.tile) pile.pop();
  hand.melds.push({ kind: option.kind as MeldKind, tiles: option.tiles, fromPlayer: pending.player, concealed: false }); hand.concealed = sortTiles(hand.concealed);
  state.currentPlayer = player; state.pendingDiscard = null; state.claimOptions = []; state.phase = 'discard'; state.lastDrawn = null; if (option.kind === 'kong') drawForPlayer(state, player);
}
function clockwisePlayers(discarder: number): number[] { return [1, 2, 3].map((offset) => (discarder + offset) % 4); }
function resolvePendingClaims(state: MahjongState, skipped: Set<number> = new Set()) {
  const pending = state.pendingDiscard; if (!pending) return;
  const ordered = clockwisePlayers(pending.player).filter((player) => !skipped.has(player)); const byPlayer = new Map(ordered.map((player) => [player, getClaimOptions(state, player)]));
  const winner = ordered.find((player) => byPlayer.get(player)?.some((option) => option.kind === 'win'));
  if (winner !== undefined) { if (winner === 0) { state.currentPlayer = 0; state.phase = 'claim'; state.claimOptions = byPlayer.get(0)!.filter((option) => option.kind === 'win'); } else finishDiscardWin(state, winner); return; }
  const setPlayer = ordered.find((player) => byPlayer.get(player)?.some((option) => option.kind === 'kong' || option.kind === 'pong'));
  if (setPlayer !== undefined) { const options = byPlayer.get(setPlayer)!.filter((option) => option.kind === 'kong' || option.kind === 'pong'); if (setPlayer === 0) { state.currentPlayer = 0; state.phase = 'claim'; state.claimOptions = options; } else applyMeldClaim(state, setPlayer, options.find((option) => option.kind === 'kong') ?? options[0]); return; }
  const next = (pending.player + 1) % 4;
  if (!skipped.has(next)) { const options = (byPlayer.get(next) ?? []).filter((option) => option.kind === 'chi'); if (options.length) { if (next === 0) { state.currentPlayer = 0; state.phase = 'claim'; state.claimOptions = options; } else applyMeldClaim(state, next, options[0]); return; } }
  advanceAfterDiscard(state);
}

function tileValue(tile: TileId, hand: TileId[]): number {
  let value = countTile(hand, tile) * 4;
  if (/^[mps]/u.test(tile)) { const suit = tile[0]; const rank = Number(tile[1]); for (const distance of [-2, -1, 1, 2]) { const neighbor = `${suit}${rank + distance}` as TileId; if (rank + distance >= 1 && rank + distance <= 9 && hand.includes(neighbor)) value += Math.abs(distance) === 1 ? 2 : 1; } }
  return value;
}
export function chooseAiDiscard(hand: TileId[], random: () => number = Math.random): number {
  const scored = hand.map((tile, index) => ({ index, value: tileValue(tile, hand), tie: random() })); scored.sort((a, b) => a.value - b.value || a.tie - b.tie); return scored[0]?.index ?? 0;
}
export function readyDiscardIndices(state: MahjongState, player: number): number[] {
  if (state.phase !== 'discard' || state.currentPlayer !== player || state.winner !== null || state.exhausted || state.readyDeclared[player]) return [];
  const hand = state.players[player]; const results: number[] = [];
  hand.concealed.forEach((_, index) => { const after = hand.concealed.filter((__, tileIndex) => tileIndex !== index); if (STANDARD_TILE_TYPES.some((candidate) => countTile(after, candidate) < 4 && isWinningHand([...after, candidate], hand.melds.length))) results.push(index); });
  return results;
}
function discardTileInternal(source: MahjongState, tileIndex: number, declaringReady: boolean): MahjongState {
  if (source.winner !== null || source.exhausted || source.phase !== 'discard') return source;
  const state = structuredClone(source); const player = state.currentPlayer; const hand = state.players[player];
  if (!declaringReady && state.readyDeclared[player] && tileIndex !== hand.concealed.length - 1) return source;
  const [discarded] = hand.concealed.splice(tileIndex, 1); if (!discarded) return source;
  hand.concealed = sortTiles(hand.concealed); hand.discards.push(discarded); state.lastDrawn = null; state.pendingDiscard = { player, tile: discarded }; resolvePendingClaims(state); return state;
}
export function discardTile(source: MahjongState, tileIndex: number): MahjongState { return discardTileInternal(source, tileIndex, false); }
export function declareReady(source: MahjongState, tileIndex: number): MahjongState {
  if (!readyDiscardIndices(source, source.currentPlayer).includes(tileIndex)) return source; const state = structuredClone(source); state.readyDeclared[state.currentPlayer] = true; return discardTileInternal(state, tileIndex, true);
}
export function claimDiscard(source: MahjongState, optionIndex: number): MahjongState {
  if (source.phase !== 'claim' || source.currentPlayer !== 0 || !source.pendingDiscard) return source; const option = source.claimOptions[optionIndex]; if (!option) return source;
  const state = structuredClone(source); if (option.kind === 'win') finishDiscardWin(state, 0); else applyMeldClaim(state, 0, option); return state;
}
export function passClaim(source: MahjongState): MahjongState {
  if (source.phase !== 'claim' || source.currentPlayer !== 0 || !source.pendingDiscard) return source; const state = structuredClone(source); state.claimOptions = []; resolvePendingClaims(state, new Set([0])); return state;
}
export function autoPlayCurrentTurn(source: MahjongState, random: () => number = Math.random): MahjongState {
  if (source.winner !== null || source.exhausted) return source;
  if (source.phase === 'claim' && source.currentPlayer === 0) { const win = source.claimOptions.findIndex((option) => option.kind === 'win'); return win >= 0 ? claimDiscard(source, win) : passClaim(source); }
  if (source.phase !== 'discard') return source; const hand = source.players[source.currentPlayer]?.concealed ?? [];
  if (source.readyDeclared[source.currentPlayer]) return discardTile(source, hand.length - 1);
  const ready = readyDiscardIndices(source, source.currentPlayer); if (ready.length) return declareReady(source, ready[Math.floor(random() * ready.length)] ?? ready[0]);
  return discardTile(source, chooseAiDiscard(hand, random));
}
export function concealedKongTiles(state: MahjongState, player: number): TileId[] {
  if (state.phase !== 'discard' || state.currentPlayer !== player || state.wall.length <= 8 || state.readyDeclared[player]) return [];
  return STANDARD_TILE_TYPES.filter((tile) => countTile(state.players[player].concealed, tile) === 4);
}
export function declareConcealedKong(source: MahjongState, tile: TileId): MahjongState {
  const player = source.currentPlayer; if (!concealedKongTiles(source, player).includes(tile)) return source; const state = structuredClone(source); const hand = state.players[player];
  removeTiles(hand.concealed, [tile, tile, tile, tile]); hand.concealed = sortTiles(hand.concealed); hand.melds.push({ kind: 'kong', tiles: [tile, tile, tile, tile], fromPlayer: null, concealed: true }); drawForPlayer(state, player); return state;
}
export const discardAndAdvance = discardTile;
export function tileLabel(tile: TileId): string {
  const suit = tile[0]; const rank = Number(tile.slice(1)); if (suit === 'm') return `${rank}萬`; if (suit === 'p') return `${rank}筒`; if (suit === 's') return `${rank}索`;
  if (suit === 'w') return ['東', '南', '西', '北'][rank - 1] ?? tile; if (suit === 'd') return ['中', '發', '白'][rank - 1] ?? tile; return ['春', '夏', '秋', '冬', '梅', '蘭', '菊', '竹'][rank - 1] ?? tile;
}
