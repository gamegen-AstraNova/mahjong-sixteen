import { useEffect, useRef } from 'react';
import { ASSETS } from '../config/assets';
import type { PlatformRuntime } from './resourceLoader';

export type BgmScene = 'base' | 'room' | 'match' | 'ready';

const TRACKS: Record<BgmScene, string> = {
  base: ASSETS.bgmBase,
  room: ASSETS.bgmRoom,
  match: ASSETS.bgmMatch,
  ready: ASSETS.bgmReady,
};

const TARGET_VOLUME = 0.28;

export function BgmPlayer({ runtime, scene, enabled }: { runtime: PlatformRuntime; scene: BgmScene; enabled: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const transitionRef = useRef(0);
  if (!audioRef.current && typeof Audio !== 'undefined') {
    audioRef.current = new Audio();
    audioRef.current.loop = true;
    audioRef.current.preload = 'auto';
    audioRef.current.volume = 0;
  }

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    const transition = ++transitionRef.current;
    const source = runtime.resolveAsset(TRACKS[scene]);
    const cancelFade = () => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    };
    const fade = (target: number, duration: number, done?: () => void) => {
      cancelFade();
      const from = audio.volume;
      const started = performance.now();
      const frame = (now: number) => {
        if (transitionRef.current !== transition) return;
        const progress = Math.min(1, (now - started) / duration);
        audio.volume = from + (target - from) * progress;
        if (progress < 1) animationRef.current = requestAnimationFrame(frame);
        else { animationRef.current = null; done?.(); }
      };
      animationRef.current = requestAnimationFrame(frame);
    };
    const startTrack = () => {
      if (transitionRef.current !== transition) return;
      if (audio.src !== source) { audio.src = source; audio.load(); }
      audio.volume = 0;
      void audio.play().then(() => fade(TARGET_VOLUME, 520)).catch(() => undefined);
    };
    const unlock = () => {
      if (!enabled || transitionRef.current !== transition || !audio.paused) return;
      void audio.play().then(() => fade(TARGET_VOLUME, 420)).catch(() => undefined);
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);

    if (!enabled) fade(0, 180, () => audio.pause());
    else if (audio.src === source) void audio.play().then(() => fade(TARGET_VOLUME, 320)).catch(() => undefined);
    else if (audio.src && !audio.paused) fade(0, 220, startTrack);
    else startTrack();

    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      transitionRef.current += 1;
      cancelFade();
    };
  }, [enabled, runtime, scene]);

  useEffect(() => () => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    audioRef.current?.pause();
  }, []);

  return null;
}
