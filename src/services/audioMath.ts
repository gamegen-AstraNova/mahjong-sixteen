export function interpolateAudioVolume(from: number, target: number, elapsed: number, duration: number): number {
  const progress = duration <= 0 ? 1 : Math.min(1, Math.max(0, elapsed / duration));
  return Math.min(1, Math.max(0, from + (target - from) * progress));
}
