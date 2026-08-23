import { CHARACTER_SKINS, TABLES, TILE_BACKS } from '../config/catalog';
import type { GachaReward, PlayerProgress } from '../types/game';

export const GACHA_COST_ONE = 500;
export const GACHA_COST_TEN = 4_500;
export const DUPLICATE_REFUND = 250;

type CosmeticKind = 'character' | 'tileBack' | 'table';
export type MilestoneChoiceKind = 'accessory' | 'character';

function choose<T>(items: T[], random: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

function rollKind(random: () => number): CosmeticKind | 'coins77' | 'coins777' | 'coins7777' {
  const roll = random();
  if (roll < 0.1) return 'character';
  if (roll < 0.3) return 'tileBack';
  if (roll < 0.5) return 'table';
  if (roll < 0.8) return 'coins77';
  if (roll < 0.95) return 'coins777';
  return 'coins7777';
}

function cosmeticReward(kind: CosmeticKind, progress: PlayerProgress, random: () => number): GachaReward {
  const items: { id: string }[] = kind === 'character' ? CHARACTER_SKINS : kind === 'tileBack' ? TILE_BACKS : TABLES;
  const item = choose(items, random);
  const owned = kind === 'character' ? progress.ownedCharacterSkins : kind === 'tileBack' ? progress.ownedTileBacks : progress.ownedTables;
  const duplicate = owned.includes(item.id);
  if (!duplicate) owned.push(item.id);
  else progress.coins += DUPLICATE_REFUND;
  return { kind, itemId: item.id, duplicate, refund: duplicate ? DUPLICATE_REFUND : 0 };
}

function rollReward(progress: PlayerProgress, random: () => number, forcedAccessory = false): GachaReward {
  const kind = forcedAccessory ? (random() < 0.5 ? 'tileBack' : 'table') : rollKind(random);
  if (kind === 'character' || kind === 'tileBack' || kind === 'table') return cosmeticReward(kind, progress, random);
  const amount = kind === 'coins77' ? 77 : kind === 'coins777' ? 777 : 7777;
  progress.coins += amount;
  return { kind: 'coins', amount };
}

function incrementMilestones(progress: PlayerProgress): void {
  progress.totalDraws += 1;
  if (progress.totalDraws % 50 === 0) progress.pendingAccessoryChoices += 1;
  if (progress.totalDraws % 100 === 0) progress.pendingCharacterChoices += 1;
}

export interface GachaResult {
  progress: PlayerProgress;
  rewards: GachaReward[];
}

export interface MilestoneChoiceResult {
  progress: PlayerProgress;
  duplicate: boolean;
}

export function claimMilestoneChoice(source: PlayerProgress, kind: MilestoneChoiceKind, itemId: string): MilestoneChoiceResult {
  const progress = structuredClone(source);
  if (kind === 'character') {
    if (progress.pendingCharacterChoices < 1 || !CHARACTER_SKINS.some((item) => item.id === itemId)) throw new Error('CHOICE_UNAVAILABLE');
    const duplicate = progress.ownedCharacterSkins.includes(itemId);
    if (duplicate) progress.coins += DUPLICATE_REFUND;
    else progress.ownedCharacterSkins.push(itemId);
    progress.pendingCharacterChoices -= 1;
    return { progress, duplicate };
  }

  const item = [...TILE_BACKS, ...TABLES].find((candidate) => candidate.id === itemId);
  if (progress.pendingAccessoryChoices < 1 || !item) throw new Error('CHOICE_UNAVAILABLE');
  const owned = item.kind === 'tileBack' ? progress.ownedTileBacks : progress.ownedTables;
  const duplicate = owned.includes(itemId);
  if (duplicate) progress.coins += DUPLICATE_REFUND;
  else owned.push(itemId);
  progress.pendingAccessoryChoices -= 1;
  return { progress, duplicate };
}

export function performGacha(source: PlayerProgress, count: 1 | 10, free: boolean, random: () => number = Math.random): GachaResult {
  const progress = structuredClone(source);
  const cost = free ? 0 : count === 1 ? GACHA_COST_ONE : GACHA_COST_TEN;
  if (progress.coins < cost) throw new Error('INSUFFICIENT_COINS');
  progress.coins -= cost;
  const rewards: GachaReward[] = [];
  const normalCount = count === 10 ? 9 : 1;
  for (let index = 0; index < normalCount; index += 1) {
    rewards.push(rollReward(progress, random));
    incrementMilestones(progress);
  }
  if (count === 10) {
    const hasAccessory = rewards.some((reward) => reward.kind === 'tileBack' || reward.kind === 'table');
    rewards.push(rollReward(progress, random, !hasAccessory));
    incrementMilestones(progress);
  }
  return { progress, rewards };
}
