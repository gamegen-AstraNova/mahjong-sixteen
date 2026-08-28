import { createServer } from 'node:net';
import { Client as ColyseusClient, type Room } from 'colyseus.js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MEV, MMSG, type OnlineEmote } from '../src/game/multiplayerProtocol';
import type { MahjongState } from '../src/game/mahjong';
import { createMahjongGameServer } from './gameServer';

interface GameViewMessage {
  state: MahjongState;
  playerSlot: number;
  canAct: boolean;
  turnDeadline: number;
  advanceReadyCount: number;
}

interface LobbyState {
  code: string;
  hostSessionId: string;
  players: { size: number };
}

async function availablePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (!address || typeof address === 'string') {
        probe.close();
        reject(new Error('Unable to reserve a multiplayer test port.'));
        return;
      }
      probe.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

function nextGameView(room: Room<LobbyState>, predicate: (view: GameViewMessage) => boolean, timeoutMs = 10_000): Promise<GameViewMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      off?.();
      reject(new Error('Timed out waiting for multiplayer game state.'));
    }, timeoutMs);
    const off = room.onMessage(MEV.gameState, (payload: GameViewMessage) => {
      if (!predicate(payload)) return;
      clearTimeout(timeout);
      off?.();
      resolve(payload);
    });
  });
}

function nextEmote(room: Room<LobbyState>, predicate: (emote: OnlineEmote) => boolean, timeoutMs = 2_000): Promise<OnlineEmote> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      off?.();
      reject(new Error('Timed out waiting for multiplayer emote.'));
    }, timeoutMs);
    const off = room.onMessage(MEV.emote, (emote: OnlineEmote) => {
      if (!predicate(emote)) return;
      clearTimeout(timeout);
      off?.();
      resolve(emote);
    });
  });
}

describe('Colyseus multiplayer server', () => {
  const gameServer = createMahjongGameServer();
  let endpoint = '';

  beforeAll(async () => {
    const port = await availablePort();
    endpoint = `ws://127.0.0.1:${port}`;
    await gameServer.listen(port);
  });

  afterAll(async () => {
    await gameServer.gracefullyShutdown(false);
  });

  it('creates a room, synchronizes its host, fills bots, and advances authoritative turns', async () => {
    const client = new ColyseusClient(endpoint);
    const room = await client.create<LobbyState>('mahjong-sixteen', { name: 'QA Player', character: 'mio_1' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(room.state.code).toMatch(/^[A-Z2-9]{4}$/u);
    expect(room.state.hostSessionId).toBe(room.sessionId);
    expect(room.state.players.size).toBe(1);

    room.onMessage(MEV.matchStart, () => undefined);
    const initialViewPromise = nextGameView(room, () => true);
    room.send(MMSG.start);
    const initialView = await initialViewPromise;
    await vi.waitFor(() => expect(room.state.players.size).toBe(4));
    expect(initialView.state.players).toHaveLength(4);
    expect(initialView.state.points).toEqual([8_000, 8_000, 8_000, 8_000]);
    expect(initialView.turnDeadline).toBeGreaterThan(Date.now());

    const localTurn = initialView.canAct
      ? initialView
      : await nextGameView(room, (view) => view.canAct, 12_000);
    const beforeDiscards = localTurn.state.players.reduce((total, hand) => total + hand.discards.length, 0);
    const advancedViewPromise = nextGameView(room, (view) => view.state.players.reduce((total, hand) => total + hand.discards.length, 0) > beforeDiscards);
    room.send(MMSG.action, { kind: 'auto' });
    const advancedView = await advancedViewPromise;
    expect(advancedView.state.players.reduce((total, hand) => total + hand.discards.length, 0)).toBeGreaterThan(beforeDiscards);

    const cosmeticRandom = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      const npcReplyPromise = nextEmote(room, (emote) => emote.seat !== 0);
      room.send(MMSG.emote, { emote: '👏' });
      await expect(npcReplyPromise).resolves.toEqual({ seat: 1, emote: '👏' });
    } finally {
      cosmeticRandom.mockRestore();
    }
    await room.leave(true);
  }, 20_000);
});
