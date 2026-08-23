import { describe, expect, it } from 'vitest';
import { DEFAULT_PROGRESS } from '../config/catalog';
import { claimMilestoneChoice, DUPLICATE_REFUND, performGacha } from './gacha';

describe('gacha', () => {
  it('charges 4,500 coins and guarantees an accessory in ten draws', () => {
    const sequence = [0.7, 0.1, 0.7, 0.2, 0.7, 0.3, 0.7, 0.4, 0.7, 0.5, 0.7, 0.6, 0.7, 0.7, 0.7, 0.8, 0.7, 0.9, 0.2, 0.1];
    let index = 0;
    const result = performGacha(DEFAULT_PROGRESS, 10, false, () => sequence[index++] ?? 0.2);
    expect(result.progress.totalDraws).toBe(10);
    expect(result.progress.coins).toBeGreaterThanOrEqual(95_500);
    expect(result.rewards.some((reward) => reward.kind === 'tileBack' || reward.kind === 'table')).toBe(true);
  });

  it('awards both milestones on draw 100', () => {
    const progress = structuredClone(DEFAULT_PROGRESS);
    progress.totalDraws = 99;
    const result = performGacha(progress, 1, true, () => 0.6);
    expect(result.progress.pendingAccessoryChoices).toBe(1);
    expect(result.progress.pendingCharacterChoices).toBe(1);
  });

  it('claims an unowned accessory and consumes one choice', () => {
    const progress = structuredClone(DEFAULT_PROGRESS);
    progress.pendingAccessoryChoices = 1;
    const result = claimMilestoneChoice(progress, 'accessory', 'tile_back_2');
    expect(result.duplicate).toBe(false);
    expect(result.progress.ownedTileBacks).toContain('tile_back_2');
    expect(result.progress.pendingAccessoryChoices).toBe(0);
  });

  it('refunds a duplicate milestone choice and still consumes it', () => {
    const progress = structuredClone(DEFAULT_PROGRESS);
    progress.pendingCharacterChoices = 1;
    const result = claimMilestoneChoice(progress, 'character', 'aya_1');
    expect(result.duplicate).toBe(true);
    expect(result.progress.coins).toBe(progress.coins + DUPLICATE_REFUND);
    expect(result.progress.pendingCharacterChoices).toBe(0);
  });

  it('rejects a milestone claim without an available choice', () => {
    expect(() => claimMilestoneChoice(DEFAULT_PROGRESS, 'accessory', 'table_2')).toThrow('CHOICE_UNAVAILABLE');
  });
});
