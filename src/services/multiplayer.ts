import { Client, type Room, type RoomAvailable } from 'colyseus.js';
import type { MahjongState } from '../game/mahjong';
import { MAHJONG_SIXTEEN_ROOM, MEV, type OnlineEmote } from '../game/multiplayerProtocol';
export { MMSG, type OnlineEmote } from '../game/multiplayerProtocol';

export interface MahjongRoomMeta {
  code?: string;
  hostName?: string;
}

export interface OpenMahjongRoom {
  roomId: string;
  code: string;
  hostName: string;
  clients: number;
  maxClients: number;
}

export interface OnlinePlayer {
  id: string;
  name: string;
  character: string;
  slot: number;
  connected: boolean;
  bot: boolean;
  host: boolean;
  ready: boolean;
  advanceReady: boolean;
}

export interface OnlineRoomSnapshot {
  code: string;
  phase: 'waiting' | 'playing' | 'over';
  hostSessionId: string;
  seed: number;
  matchId: number;
  roundIndex: number;
  players: OnlinePlayer[];
}

export interface OnlineGameView {
  state: MahjongState;
  playerSlot: number;
  canAct: boolean;
  turnDeadline: number;
  advanceReadyCount: number;
}

type SchemaPlayers = { forEach(callback: (player: Record<string, unknown>, id: string) => void): void };
type RoomState = Record<string, unknown> & { players?: SchemaPlayers };
export type MahjongRoom = Room<RoomState>;

function roomSnapshot(state: RoomState): OnlineRoomSnapshot {
  const players: OnlinePlayer[] = [];
  state.players?.forEach((player, id) => {
    players.push({
      id,
      name: String(player.name ?? ''),
      character: String(player.character ?? ''),
      slot: Number(player.slot ?? 0),
      connected: player.connected !== false,
      bot: player.bot === true,
      host: player.host === true,
      ready: player.ready === true || player.readyDeclared === true,
      advanceReady: player.advanceReady === true,
    });
  });
  players.sort((left, right) => left.slot - right.slot);
  return {
    code: String(state.code ?? ''),
    phase: (state.phase === 'playing' || state.phase === 'over') ? state.phase : 'waiting',
    hostSessionId: String(state.hostSessionId ?? ''),
    seed: Number(state.seed ?? 0),
    matchId: Number(state.matchId ?? 0),
    roundIndex: Math.max(0, Math.min(3, Number(state.roundIndex ?? 0))),
    players,
  };
}

function rotateSeat(seat: number, localSlot: number): number { return (seat - localSlot + 4) % 4; }

export function rotateMahjongState(state: MahjongState, localSlot: number): MahjongState {
  const rotated = structuredClone(state);
  rotated.players = Array.from({ length: 4 }, (_, localSeat) => {
    const hand = structuredClone(state.players[(localSeat + localSlot) % 4]);
    hand.melds.forEach((meld) => { if (meld.fromPlayer !== null) meld.fromPlayer = rotateSeat(meld.fromPlayer, localSlot); });
    return hand;
  });
  rotated.points = Array.from({ length: 4 }, (_, localSeat) => state.points[(localSeat + localSlot) % 4]);
  rotated.readyDeclared = Array.from({ length: 4 }, (_, localSeat) => state.readyDeclared[(localSeat + localSlot) % 4]);
  rotated.currentPlayer = rotateSeat(state.currentPlayer, localSlot);
  rotated.dealer = rotateSeat(state.dealer, localSlot);
  rotated.eastSeat = rotateSeat(state.eastSeat, localSlot);
  rotated.winner = state.winner === null ? null : rotateSeat(state.winner, localSlot);
  rotated.loser = state.loser === null ? null : rotateSeat(state.loser, localSlot);
  if (rotated.pendingDiscard) rotated.pendingDiscard.player = rotateSeat(rotated.pendingDiscard.player, localSlot);
  if (rotated.lastTileFocus) {
    rotated.lastTileFocus.seat = rotateSeat(rotated.lastTileFocus.seat, localSlot);
    if (rotated.lastTileFocus.area === 'win') rotated.lastTileFocus.riverSeat = rotateSeat(rotated.lastTileFocus.riverSeat, localSlot);
  }
  return rotated;
}

function gameView(payload: unknown): OnlineGameView | null {
  if (!payload || typeof payload !== 'object') return null;
  const source = payload as Record<string, unknown>;
  const playerSlot = Math.max(0, Math.min(3, Number(source.playerSlot ?? 0)));
  if (!source.state || typeof source.state !== 'object') return null;
  return {
    state: rotateMahjongState(source.state as MahjongState, playerSlot),
    playerSlot,
    canAct: source.canAct === true,
    turnDeadline: Math.max(0, Number(source.turnDeadline ?? 0)),
    advanceReadyCount: Math.max(0, Math.min(4, Number(source.advanceReadyCount ?? 0))),
  };
}

export class MahjongMultiplayerClient {
  private readonly client: Client;

  constructor(serverUrl: string) {
    this.client = new Client(serverUrl);
  }

  async listRooms(): Promise<OpenMahjongRoom[]> {
    const rooms = await this.client.getAvailableRooms<MahjongRoomMeta>(MAHJONG_SIXTEEN_ROOM);
    return rooms.map((room: RoomAvailable<MahjongRoomMeta>) => ({
      roomId: room.roomId,
      code: room.metadata?.code ?? room.roomId.slice(0, 4).toUpperCase(),
      hostName: room.metadata?.hostName ?? '',
      clients: room.clients,
      maxClients: room.maxClients,
    }));
  }

  create(name: string, character: string): Promise<MahjongRoom> {
    return this.client.create<RoomState>(MAHJONG_SIXTEEN_ROOM, { name, character });
  }

  join(roomId: string, name: string, character: string): Promise<MahjongRoom> {
    return this.client.joinById<RoomState>(roomId, { name, character });
  }
}

export function subscribeRoom(room: MahjongRoom, handlers: {
  onRoomChange(snapshot: OnlineRoomSnapshot): void;
  onGameState(view: OnlineGameView): void;
  onEmote(message: OnlineEmote): void;
  onRejected(): void;
}): () => void {
  const handler = (state: RoomState) => handlers.onRoomChange(roomSnapshot(state));
  room.onStateChange(handler);
  const offMatchStart = room.onMessage(MEV.matchStart, () => handler(room.state));
  const offRoundStart = room.onMessage(MEV.roundStart, () => handler(room.state));
  const offGameState = room.onMessage(MEV.gameState, (payload: unknown) => { const view = gameView(payload); if (view) handlers.onGameState(view); });
  const offEmote = room.onMessage(MEV.emote, (payload: OnlineEmote) => handlers.onEmote(payload));
  const offRejected = room.onMessage(MEV.actionRejected, handlers.onRejected);
  if (room.state) handler(room.state);
  return () => {
    room.onStateChange.remove(handler);
    if (typeof offMatchStart === 'function') offMatchStart();
    if (typeof offRoundStart === 'function') offRoundStart();
    if (typeof offGameState === 'function') offGameState();
    if (typeof offEmote === 'function') offEmote();
    if (typeof offRejected === 'function') offRejected();
  };
}
