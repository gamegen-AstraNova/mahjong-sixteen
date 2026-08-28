import { MapSchema, Schema, defineTypes } from '@colyseus/schema';

export class OnlinePlayerState extends Schema {
  declare id: string;
  declare name: string;
  declare character: string;
  declare slot: number;
  declare connected: boolean;
  declare bot: boolean;
  declare host: boolean;
  declare ready: boolean;
  declare advanceReady: boolean;

  constructor() {
    super();
    this.id = '';
    this.name = '';
    this.character = '';
    this.slot = 0;
    this.connected = true;
    this.bot = false;
    this.host = false;
    this.ready = false;
    this.advanceReady = false;
  }
}

defineTypes(OnlinePlayerState, {
  id: 'string',
  name: 'string',
  character: 'string',
  slot: 'uint8',
  connected: 'boolean',
  bot: 'boolean',
  host: 'boolean',
  ready: 'boolean',
  advanceReady: 'boolean',
});

export class MahjongRoomState extends Schema {
  declare code: string;
  declare phase: 'waiting' | 'playing' | 'over';
  declare hostSessionId: string;
  declare seed: number;
  declare matchId: number;
  declare roundIndex: number;
  declare players: MapSchema<OnlinePlayerState>;

  constructor() {
    super();
    this.code = '';
    this.phase = 'waiting';
    this.hostSessionId = '';
    this.seed = 0;
    this.matchId = 0;
    this.roundIndex = 0;
    this.players = new MapSchema<OnlinePlayerState>();
  }
}

defineTypes(MahjongRoomState, {
  code: 'string',
  phase: 'string',
  hostSessionId: 'string',
  seed: 'number',
  matchId: 'number',
  roundIndex: 'uint8',
  players: { map: OnlinePlayerState },
});
