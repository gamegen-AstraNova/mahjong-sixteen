import type { TileId } from './mahjong';

export const MAHJONG_SIXTEEN_ROOM = 'mahjong-sixteen';

export const MMSG = {
  start: 'mahjong:start',
  action: 'mahjong:action',
  continue: 'mahjong:continue',
  emote: 'mahjong:emote',
} as const;

export const MEV = {
  matchStart: 'mahjong:match-start',
  roundStart: 'mahjong:round-start',
  gameState: 'mahjong:game-state',
  emote: 'mahjong:emote',
  actionRejected: 'mahjong:action-rejected',
} as const;

export type MahjongOnlineAction =
  | { kind: 'discard' | 'ready'; tileIndex: number }
  | { kind: 'kong'; tile: TileId }
  | { kind: 'claim'; optionIndex: number }
  | { kind: 'pass' | 'auto' };

export interface OnlineEmote {
  seat: number;
  emote: string;
}
