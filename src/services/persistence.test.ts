import { describe, expect, it } from 'vitest';
import { DEFAULT_PROGRESS } from '../config/catalog';
import { taipeiDailyKey } from './daily';
import { exportProgress, importProgress } from './transfer';

describe('daily reset', () => {
  it('uses 04:00 in Asia/Taipei as the day boundary', () => {
    expect(taipeiDailyKey(new Date('2026-08-20T19:59:59Z'))).toBe('2026-08-20');
    expect(taipeiDailyKey(new Date('2026-08-20T20:00:00Z'))).toBe('2026-08-21');
  });
});

describe('transfer code', () => {
  it('round-trips progress and rejects damaged data', () => {
    const progress = { ...structuredClone(DEFAULT_PROGRESS), coins: 123456, totalDraws: 42 };
    const code = exportProgress(progress);

    expect(importProgress(code)).toMatchObject({ coins: 123456, totalDraws: 42 });
    expect(() => importProgress(`${code.slice(0, -1)}x`)).toThrow('INVALID_TRANSFER_CODE');
  });

  it('sanitizes impossible imported coin values', () => {
    const code = exportProgress({ ...structuredClone(DEFAULT_PROGRESS), coins: -100 });
    expect(importProgress(code).coins).toBe(0);
  });
});
