import type { MatchActionSignal, MatchSeat } from './matchActionEvents';

export const MATCH_EMOTES = ['😊', '😄', '😮', '😢', '😤', '🤔', '👏', '✨'] as const;
export type MatchEmote = typeof MATCH_EMOTES[number];

export interface NpcEmoteReaction {
  seat: MatchSeat;
  emote: MatchEmote;
}

export const NPC_PLAYER_EMOTE_REPLY_CHANCE = 0.65;
export const NPC_EMOTE_REPLY_DELAY_MIN_MS = 350;
export const NPC_EMOTE_REPLY_DELAY_RANGE_MS = 550;

const NPC_SUCCESS_EMOTES = ['😊', '✨'] as const;
const NPC_PLAYER_MILESTONE_EMOTES = ['😮', '👏'] as const;
const PLAYER_EMOTE_RESPONSES: Record<MatchEmote, readonly MatchEmote[]> = {
  '😊': ['😊', '😄', '✨'],
  '😄': ['😄', '😊', '✨'],
  '😮': ['😮', '🤔', '✨'],
  '😢': ['😢', '😊', '👏'],
  '😤': ['😤', '🤔', '👏'],
  '🤔': ['🤔', '😮', '✨'],
  '👏': ['👏', '😊', '✨'],
  '✨': ['✨', '😊', '👏'],
};

function pick<T>(items: readonly T[], random: () => number): T {
  const index = Math.min(items.length - 1, Math.max(0, Math.floor(random() * items.length)));
  return items[index];
}

export function isMatchEmote(value: unknown): value is MatchEmote {
  return typeof value === 'string' && (MATCH_EMOTES as readonly string[]).includes(value);
}

function isMilestone(signal: MatchActionSignal): boolean {
  return signal.kind === 'ready' || signal.kind === 'win' || signal.kind === 'selfDraw';
}

export function npcActionEmotes(
  signals: readonly MatchActionSignal[],
  npcSeats: readonly MatchSeat[],
  random: () => number = Math.random,
): NpcEmoteReaction[] {
  const npcSeatSet = new Set<MatchSeat>(npcSeats);
  const reactions: NpcEmoteReaction[] = [];
  signals.forEach((signal) => {
    if (!isMilestone(signal)) return;
    if (npcSeatSet.has(signal.seat)) {
      reactions.push({ seat: signal.seat, emote: pick(NPC_SUCCESS_EMOTES, random) });
      return;
    }
    npcSeats.forEach((seat) => reactions.push({ seat, emote: pick(NPC_PLAYER_MILESTONE_EMOTES, random) }));
  });
  return reactions;
}

export function npcPlayerEmoteReply(
  playerEmote: MatchEmote,
  npcSeats: readonly MatchSeat[],
  random: () => number = Math.random,
): NpcEmoteReaction | null {
  if (npcSeats.length === 0 || random() >= NPC_PLAYER_EMOTE_REPLY_CHANCE) return null;
  return {
    seat: pick(npcSeats, random),
    emote: pick(PLAYER_EMOTE_RESPONSES[playerEmote], random),
  };
}
