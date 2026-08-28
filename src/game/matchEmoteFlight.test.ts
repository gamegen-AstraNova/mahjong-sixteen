import { describe, expect, it } from 'vitest';
import { createMatchEmoteFlight, type MatchEmoteSeat } from './matchEmoteFlight';

describe('match emote flight paths', () => {
  it.each([0, 1, 2, 3] as MatchEmoteSeat[])('keeps seat %s on one straight inward lane', (seat) => {
    const path = createMatchEmoteFlight(seat, () => .5);

    if (seat === 0) {
      expect(path.startX).toBe(path.endX);
      expect(path.startY).toBeGreaterThan(path.endY);
      expect(path.endY).toBeGreaterThan(0);
    } else if (seat === 1) {
      expect(path.startY).toBe(path.endY);
      expect(path.startX).toBeLessThan(path.endX);
      expect(path.endX).toBeLessThan(0);
    } else if (seat === 2) {
      expect(path.startX).toBe(path.endX);
      expect(path.startY).toBeLessThan(path.endY);
      expect(path.endY).toBeLessThan(0);
    } else {
      expect(path.startY).toBe(path.endY);
      expect(path.startX).toBeGreaterThan(path.endX);
      expect(path.endX).toBeGreaterThan(0);
    }
  });

  it('randomizes the origin lane while keeping the destination inside the discard band', () => {
    const values = [0, 1, .25, .75];
    let index = 0;
    const path = createMatchEmoteFlight(0, () => values[index++] ?? .5);

    expect(path).toEqual({
      startX: -14,
      startY: 44,
      endX: -14,
      endY: 14,
      rotation: 6,
    });
  });
});
