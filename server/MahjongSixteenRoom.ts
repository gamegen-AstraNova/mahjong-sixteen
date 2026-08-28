import { Room, type Client } from '@colyseus/core';
import {
  TURN_TIME_SECONDS,
  advanceAfterAllPasses,
  chooseAiDiscard,
  claimDiscardForPlayer,
  createInitialState,
  createSeededRandom,
  declareKong,
  declareReadyAwaitingClaims,
  discardTileAwaitingClaims,
  kongTiles,
  nextPendingClaimTurn,
  readyDiscardIndices,
  startNextHand,
  type MahjongState,
  type TileId,
} from '../src/game/mahjong.js';
import { MAHJONG_SIXTEEN_ROOM, MEV, MMSG, type MahjongOnlineAction } from '../src/game/multiplayerProtocol.js';
import { MahjongRoomState, OnlinePlayerState } from './state.js';

const SETTLEMENT_AUTO_ADVANCE_MS = 10_000;
const BOT_ACTION_DELAY_MS = 1_500;
const VALID_EMOTES = new Set(['😊', '😄', '😮', '😢', '😤', '🤔', '👏', '✨']);
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const BOT_PROFILES = [
  { name: 'Lumi', character: 'mio_1' },
  { name: 'Nyx', character: 'sora_1' },
  { name: 'Asteria', character: 'aya_1' },
] as const;

function roomCode(random = Math.random): string {
  return Array.from({ length: 4 }, () => ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)]).join('');
}

function cleanText(value: unknown, fallback: string, maxLength: number): string {
  const cleaned = String(value ?? '').trim().replace(/[\u0000-\u001f\u007f]/gu, '').slice(0, maxLength);
  return cleaned || fallback;
}

function isOnlineAction(value: unknown): value is MahjongOnlineAction {
  if (!value || typeof value !== 'object') return false;
  const action = value as Record<string, unknown>;
  if (action.kind === 'pass' || action.kind === 'auto') return true;
  if ((action.kind === 'discard' || action.kind === 'ready') && Number.isInteger(action.tileIndex)) return true;
  if (action.kind === 'claim' && Number.isInteger(action.optionIndex)) return true;
  return action.kind === 'kong' && typeof action.tile === 'string';
}

export class MahjongSixteenRoom extends Room<MahjongRoomState> {
  maxClients = 4;
  private gameState: MahjongState | null = null;
  private random: () => number = Math.random;
  private skippedClaims = new Set<number>();
  private turnDeadline = 0;
  private actionTimer: { clear(): void } | null = null;

  onCreate(): void {
    const state = new MahjongRoomState();
    state.code = roomCode();
    this.setState(state);
    void this.setMetadata({ code: state.code, hostName: '' });
    this.setPatchRate(50);
    this.onMessage(MMSG.start, (client) => this.startMatch(client));
    this.onMessage(MMSG.action, (client, action) => this.handleAction(client, action));
    this.onMessage(MMSG.continue, (client) => this.markAdvanceReady(client));
    this.onMessage(MMSG.emote, (client, payload) => this.relayEmote(client, payload));
  }

  onJoin(client: Client, options: Record<string, unknown>): void {
    if (this.state.phase !== 'waiting') throw new Error('Match already started.');
    const occupied = new Set(Array.from(this.state.players.values()).map((player) => player.slot));
    const slot = [0, 1, 2, 3].find((candidate) => !occupied.has(candidate));
    if (slot === undefined) throw new Error('Room is full.');
    const player = new OnlinePlayerState();
    player.id = client.sessionId;
    player.name = cleanText(options.name, `Player ${slot + 1}`, 16);
    player.character = cleanText(options.character, 'lumi_default', 64);
    player.slot = slot;
    player.host = this.state.players.size === 0;
    this.state.players.set(client.sessionId, player);
    if (player.host) this.state.hostSessionId = client.sessionId;
    this.refreshMetadata();
  }

  onLeave(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    if (this.state.phase === 'waiting') this.state.players.delete(client.sessionId);
    else {
      player.connected = false;
      player.advanceReady = true;
    }
    if (this.state.hostSessionId === client.sessionId) {
      const nextHost = Array.from(this.state.players.values()).filter((candidate) => candidate.connected).sort((left, right) => left.slot - right.slot)[0];
      this.state.hostSessionId = nextHost?.id ?? '';
      this.state.players.forEach((candidate) => { candidate.host = candidate.id === this.state.hostSessionId; });
    }
    this.refreshMetadata();
    if (this.gameState?.settlement && this.everyPlayerAdvanceReady()) this.advanceRound();
  }

  onDispose(): void {
    this.actionTimer?.clear();
  }

  private refreshMetadata(): void {
    const host = this.state.players.get(this.state.hostSessionId);
    void this.setMetadata({ code: this.state.code, hostName: host?.name ?? '' });
  }

  private reject(client: Client): void {
    client.send(MEV.actionRejected, {});
  }

  private startMatch(client: Client): void {
    if (client.sessionId !== this.state.hostSessionId || this.state.phase !== 'waiting') {
      this.reject(client);
      return;
    }
    this.fillEmptySeatsWithBots();
    this.state.seed = Math.floor(Math.random() * 0x1_0000_0000);
    this.random = createSeededRandom(this.state.seed);
    this.state.matchId += 1;
    this.state.roundIndex = 0;
    this.state.phase = 'playing';
    void this.lock();
    this.state.players.forEach((player) => { player.advanceReady = player.bot; player.ready = false; });
    this.gameState = createInitialState(this.random);
    this.skippedClaims.clear();
    this.broadcast(MEV.matchStart, {}, { afterNextPatch: true });
    this.publishGameState();
  }

  private fillEmptySeatsWithBots(): void {
    const occupied = new Set(Array.from(this.state.players.values()).map((player) => player.slot));
    let botIndex = 0;
    for (const slot of [0, 1, 2, 3]) {
      if (occupied.has(slot)) continue;
      const profile = BOT_PROFILES[botIndex % BOT_PROFILES.length];
      const player = new OnlinePlayerState();
      player.id = `bot-${slot}`;
      player.name = profile.name;
      player.character = profile.character;
      player.slot = slot;
      player.bot = true;
      player.advanceReady = true;
      this.state.players.set(player.id, player);
      botIndex += 1;
    }
  }

  private handleAction(client: Client, payload: unknown): void {
    const player = this.state.players.get(client.sessionId);
    const current = this.gameState;
    if (!player || !current || current.settlement || current.currentPlayer !== player.slot || !isOnlineAction(payload)) {
      this.reject(client);
      return;
    }
    const before = current;
    let next = current;
    if (payload.kind === 'discard') next = discardTileAwaitingClaims(current, player.slot, payload.tileIndex);
    else if (payload.kind === 'ready') next = declareReadyAwaitingClaims(current, player.slot, payload.tileIndex);
    else if (payload.kind === 'kong') next = declareKong(current, payload.tile as TileId, undefined, this.random);
    else if (payload.kind === 'claim') next = claimDiscardForPlayer(current, player.slot, payload.optionIndex);
    else if (payload.kind === 'pass') next = this.passCurrentClaim(current, player.slot);
    else next = this.autoPlay(current);
    if (next === before) {
      this.reject(client);
      return;
    }
    this.gameState = this.prepareClaimTurn(next, payload.kind === 'discard' || payload.kind === 'ready');
    this.publishGameState();
  }

  private autoPlay(current: MahjongState, claimMelds = false): MahjongState {
    if (current.phase === 'claim') {
      let claimIndex = current.claimOptions.findIndex((option) => option.kind === 'win');
      if (claimIndex < 0 && claimMelds) claimIndex = Math.max(0, current.claimOptions.findIndex((option) => option.kind === 'kong'));
      return claimIndex >= 0
        ? claimDiscardForPlayer(current, current.currentPlayer, claimIndex)
        : this.passCurrentClaim(current, current.currentPlayer);
    }
    const hand = current.players[current.currentPlayer];
    if (current.readyDeclared[current.currentPlayer]) return discardTileAwaitingClaims(current, current.currentPlayer, hand.concealed.length - 1);
    if (claimMelds) {
      const kongs = kongTiles(current, current.currentPlayer);
      if (kongs.length > 0) return declareKong(current, kongs[0], undefined, this.random);
      const ready = readyDiscardIndices(current, current.currentPlayer);
      if (ready.length > 0) return declareReadyAwaitingClaims(current, current.currentPlayer, ready[Math.floor(this.random() * ready.length)] ?? ready[0]);
    }
    const tileIndex = chooseAiDiscard(hand.concealed, this.random);
    return discardTileAwaitingClaims(current, current.currentPlayer, tileIndex);
  }

  private passCurrentClaim(current: MahjongState, player: number): MahjongState {
    if (current.phase !== 'claim' || current.currentPlayer !== player || !current.pendingDiscard) return current;
    this.skippedClaims.add(player);
    return structuredClone(current);
  }

  private prepareClaimTurn(current: MahjongState, resetSkipped: boolean): MahjongState {
    if (!current.pendingDiscard) {
      this.skippedClaims.clear();
      return current;
    }
    if (resetSkipped) this.skippedClaims.clear();
    const turn = nextPendingClaimTurn(current, this.skippedClaims);
    if (!turn) {
      this.skippedClaims.clear();
      return advanceAfterAllPasses(current, undefined, this.random);
    }
    const next = structuredClone(current);
    next.phase = 'claim';
    next.currentPlayer = turn.player;
    next.claimOptions = turn.options;
    return next;
  }

  private markAdvanceReady(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || !this.gameState?.settlement) {
      this.reject(client);
      return;
    }
    player.advanceReady = true;
    if (this.everyPlayerAdvanceReady()) this.advanceRound();
    else this.publishGameState(false);
  }

  private everyPlayerAdvanceReady(): boolean {
    return this.state.players.size === 4 && Array.from(this.state.players.values()).every((player) => player.advanceReady || !player.connected);
  }

  private advanceRound(): void {
    if (!this.gameState?.settlement) return;
    this.actionTimer?.clear();
    const completedMatch = this.gameState.matchComplete;
    this.gameState = completedMatch ? createInitialState(this.random) : startNextHand(this.gameState, this.random);
    if (completedMatch) this.state.matchId += 1;
    this.state.roundIndex = Number(this.gameState.prevailingWind.slice(1)) - 1;
    this.state.phase = 'playing';
    this.state.players.forEach((player) => { player.advanceReady = player.bot; player.ready = false; });
    this.skippedClaims.clear();
    this.broadcast(MEV.roundStart, {}, { afterNextPatch: true });
    this.publishGameState();
  }

  private relayEmote(client: Client, payload: unknown): void {
    const player = this.state.players.get(client.sessionId);
    const emote = typeof (payload as { emote?: unknown } | null)?.emote === 'string' ? (payload as { emote: string }).emote : '';
    if (!player || !VALID_EMOTES.has(emote)) return;
    this.broadcast(MEV.emote, { seat: player.slot, emote });
  }

  private publishGameState(resetTimer = true): void {
    const current = this.gameState;
    if (!current) return;
    this.state.roundIndex = Number(current.prevailingWind.slice(1)) - 1;
    this.state.phase = 'playing';
    this.state.players.forEach((player) => { player.ready = current.readyDeclared[player.slot] ?? false; });
    if (resetTimer) {
      const activePlayer = this.playerAtSlot(current.currentPlayer);
      const delay = current.settlement ? SETTLEMENT_AUTO_ADVANCE_MS : activePlayer?.bot || !activePlayer?.connected ? BOT_ACTION_DELAY_MS : TURN_TIME_SECONDS * 1_000;
      this.scheduleTimeout(delay);
    }
    const advanceReadyCount = Array.from(this.state.players.values()).filter((player) => player.advanceReady).length;
    this.clients.forEach((client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      client.send(MEV.gameState, {
        state: current,
        playerSlot: player.slot,
        canAct: !current.settlement && current.currentPlayer === player.slot,
        turnDeadline: this.turnDeadline,
        advanceReadyCount,
      });
    });
  }

  private playerAtSlot(slot: number): OnlinePlayerState | undefined {
    return Array.from(this.state.players.values()).find((player) => player.slot === slot);
  }

  private scheduleTimeout(delayMs: number): void {
    this.actionTimer?.clear();
    this.turnDeadline = Date.now() + delayMs;
    this.actionTimer = this.clock.setTimeout(() => {
      if (!this.gameState) return;
      if (this.gameState.settlement) this.advanceRound();
      else {
        const activePlayer = this.playerAtSlot(this.gameState.currentPlayer);
        const automated = this.autoPlay(this.gameState, activePlayer?.bot === true);
        this.gameState = this.prepareClaimTurn(automated, this.gameState.phase === 'discard');
        this.publishGameState();
      }
    }, delayMs);
  }
}

export { MAHJONG_SIXTEEN_ROOM };
