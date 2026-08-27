import { describe, expect, it } from 'vitest';
import { advanceSecretSequence, SECRET_REWARD_COINS, type SecretSequenceResult } from './secretReward';

function enterSequence(keys: string[]): { completed: boolean; nextIndex: number } {
  return keys.reduce<SecretSequenceResult>(
    (state, key) => advanceSecretSequence(state.nextIndex, key),
    { completed: false, nextIndex: 0 },
  );
}

describe('secret reward', () => {
  it('completes the keyboard sequence and resets its position', () => {
    expect(enterSequence([
      'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
      'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'B', 'a',
    ])).toEqual({ completed: true, nextIndex: 0 });
  });

  it('recovers from a mismatch that begins a new sequence', () => {
    let state = enterSequence(['ArrowUp', 'ArrowDown']);
    expect(state).toEqual({ completed: false, nextIndex: 0 });
    state = advanceSecretSequence(state.nextIndex, 'ArrowUp');
    expect(state.nextIndex).toBe(1);
  });

  it('awards exactly ten thousand coins', () => {
    expect(SECRET_REWARD_COINS).toBe(10_000);
  });
});
