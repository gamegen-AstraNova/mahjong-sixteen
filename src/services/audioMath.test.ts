import { describe, expect, it } from 'vitest';
import { interpolateAudioVolume } from './audioMath';

describe('audio volume interpolation', () => {
  it('does not produce a negative volume when an animation timestamp goes backwards', () => {
    expect(interpolateAudioVolume(0, 0.28, -16, 320)).toBe(0);
  });

  it('clamps fade values to the media element volume range', () => {
    expect(interpolateAudioVolume(0.8, 1.4, 500, 320)).toBe(1);
    expect(interpolateAudioVolume(0.2, -0.4, 500, 320)).toBe(0);
  });
});
