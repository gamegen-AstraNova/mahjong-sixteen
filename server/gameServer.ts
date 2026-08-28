import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { MAHJONG_SIXTEEN_ROOM, MahjongSixteenRoom } from './MahjongSixteenRoom.js';

export function createMahjongGameServer(): Server {
  const gameServer = new Server({ gracefullyShutdown: false, transport: new WebSocketTransport() });
  gameServer.define(MAHJONG_SIXTEEN_ROOM, MahjongSixteenRoom);
  return gameServer;
}
