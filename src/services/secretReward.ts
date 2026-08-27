export const SECRET_REWARD_COINS = 10_000;
export const SECRET_HOLD_DURATION_MS = 1_800;
export const SECRET_TRIGGER_CORNER_PX = 96;

const SECRET_CODE = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
] as const;

export type SecretSequenceResult = {
  completed: boolean;
  nextIndex: number;
};

export function advanceSecretSequence(currentIndex: number, key: string): SecretSequenceResult {
  const normalizedKey = key.length === 1 ? key.toLowerCase() : key;
  if (normalizedKey === SECRET_CODE[currentIndex]) {
    const nextIndex = currentIndex + 1;
    return nextIndex === SECRET_CODE.length
      ? { completed: true, nextIndex: 0 }
      : { completed: false, nextIndex };
  }

  return {
    completed: false,
    nextIndex: normalizedKey === SECRET_CODE[0] ? 1 : 0,
  };
}
