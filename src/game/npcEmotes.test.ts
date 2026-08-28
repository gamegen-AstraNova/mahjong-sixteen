import { describe, expect, it } from 'vitest';
import { npcActionEmotes, npcPlayerEmoteReply } from './npcEmotes';

describe('NPC emote reactions', () => {
  it('celebrates an NPC ready or win with a smile or sparkle', () => {
    expect(npcActionEmotes([{ seat: 2, kind: 'ready' }], [1, 2, 3], () => 0)).toEqual([{ seat: 2, emote: '😊' }]);
    expect(npcActionEmotes([{ seat: 3, kind: 'selfDraw' }], [1, 2, 3], () => 0.99)).toEqual([{ seat: 3, emote: '✨' }]);
  });

  it('has every NPC react to a player milestone with surprise or applause', () => {
    expect(npcActionEmotes([{ seat: 0, kind: 'win' }], [1, 2, 3], () => 0)).toEqual([
      { seat: 1, emote: '😮' },
      { seat: 2, emote: '😮' },
      { seat: 3, emote: '😮' },
    ]);
  });

  it('ignores ordinary calls and may mirror a player emote from one NPC', () => {
    expect(npcActionEmotes([{ seat: 1, kind: 'pong' }], [1, 2, 3], () => 0)).toEqual([]);
    expect(npcPlayerEmoteReply('👏', [1, 2, 3], () => 0)).toEqual({ seat: 1, emote: '👏' });
    expect(npcPlayerEmoteReply('👏', [1, 2, 3], () => 0.99)).toBeNull();
  });
});
