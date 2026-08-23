import { Client, type Room, type RoomAvailable } from 'colyseus.js';

export const MAHJONG_SIXTEEN_ROOM = 'mahjong-sixteen';
export const MMSG = { start: 'mahjong:start' } as const;
export const MEV = { matchStart: 'mahjong:match-start', actionRejected: 'mahjong:action-rejected' } as const;

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
}

export interface OnlineRoomSnapshot {
  code: string;
  phase: 'waiting' | 'playing' | 'over';
  hostSessionId: string;
  seed: number;
  matchId: number;
  players: OnlinePlayer[];
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
    });
  });
  players.sort((left, right) => left.slot - right.slot);
  return {
    code: String(state.code ?? ''),
    phase: (state.phase === 'playing' || state.phase === 'over') ? state.phase : 'waiting',
    hostSessionId: String(state.hostSessionId ?? ''),
    seed: Number(state.seed ?? 0),
    matchId: Number(state.matchId ?? 0),
    players,
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

export function subscribeRoom(room: MahjongRoom, onChange: (snapshot: OnlineRoomSnapshot) => void): () => void {
  const handler = (state: RoomState) => onChange(roomSnapshot(state));
  room.onStateChange(handler);
  const offMatchStart = room.onMessage(MEV.matchStart, () => handler(room.state));
  const offRejected = room.onMessage(MEV.actionRejected, () => undefined);
  if (room.state) handler(room.state);
  return () => {
    room.onStateChange.remove(handler);
    if (typeof offMatchStart === 'function') offMatchStart();
    if (typeof offRejected === 'function') offRejected();
  };
}
