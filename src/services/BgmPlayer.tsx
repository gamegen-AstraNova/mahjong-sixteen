import { useEffect, useRef } from 'react';
import { ASSETS } from '../config/assets';
import { interpolateAudioVolume } from './audioMath';
import type { PlatformRuntime } from './resourceLoader';

export type BgmScene = 'base' | 'room' | 'match' | 'ready';

const TRACKS: Record<BgmScene, string> = {
  base: ASSETS.bgmBase,
  room: ASSETS.bgmRoom,
  match: ASSETS.bgmMatch,
  ready: ASSETS.bgmReady,
};

const TRACK_SCENES = Object.keys(TRACKS) as BgmScene[];
const TARGET_VOLUME = 0.28;

export function BgmPlayer({ runtime, scene, enabled }: { runtime: PlatformRuntime; scene: BgmScene; enabled: boolean }) {
  const sceneRef = useRef(scene);
  const enabledRef = useRef(enabled);
  const syncPlaybackRef = useRef<(duration?: number) => void>(() => undefined);
  sceneRef.current = scene;
  enabledRef.current = enabled;

  useEffect(() => {
    if (typeof Audio === 'undefined') return undefined;

    const tracks = Object.fromEntries(TRACK_SCENES.map((trackScene) => {
      const relativePath = TRACKS[trackScene];
      const source = runtime.resolveAsset(relativePath);
      const audio = runtime.getPreloadedAudio(relativePath) ?? new Audio(source);
      if (audio.src !== source) {
        audio.src = source;
        audio.load();
      }
      audio.loop = true;
      audio.preload = 'auto';
      audio.volume = 0;
      audio.muted = false;
      audio.hidden = true;
      audio.dataset.bgmScene = trackScene;
      audio.setAttribute('aria-hidden', 'true');
      if (!audio.isConnected) document.body.append(audio);
      return [trackScene, audio];
    })) as Record<BgmScene, HTMLAudioElement>;
    const fadeFrames = new Map<HTMLAudioElement, number>();
    const primedScenes = new Set<BgmScene>();

    const cancelFade = (audio: HTMLAudioElement) => {
      const frame = fadeFrames.get(audio);
      if (frame !== undefined) cancelAnimationFrame(frame);
      fadeFrames.delete(audio);
    };
    const fadeAudio = (audio: HTMLAudioElement, target: number, duration: number, done?: () => void) => {
      cancelFade(audio);
      if (duration <= 0) {
        audio.volume = target;
        done?.();
        return;
      }
      const from = audio.volume;
      const started = performance.now();
      const frame = (now: number) => {
        const progress = Math.min(1, Math.max(0, (now - started) / duration));
        audio.volume = interpolateAudioVolume(from, target, now - started, duration);
        if (progress < 1) fadeFrames.set(audio, requestAnimationFrame(frame));
        else {
          fadeFrames.delete(audio);
          done?.();
        }
      };
      fadeFrames.set(audio, requestAnimationFrame(frame));
    };
    const playScene = (trackScene: BgmScene, duration: number) => {
      const audio = tracks[trackScene];
      audio.muted = false;
      audio.dataset.bgmPlayback = 'starting';
      void audio.play().then(() => {
        primedScenes.add(trackScene);
        audio.dataset.bgmPlayback = 'playing';
        if (enabledRef.current && sceneRef.current === trackScene) fadeAudio(audio, TARGET_VOLUME, duration);
      }).catch(() => { audio.dataset.bgmPlayback = 'blocked'; });
    };
    const syncPlayback = (duration = 320) => {
      const activeScene = sceneRef.current;
      TRACK_SCENES.forEach((trackScene) => {
        if (enabledRef.current && trackScene === activeScene) return;
        const audio = tracks[trackScene];
        if (audio.paused) {
          cancelFade(audio);
          audio.volume = 0;
          audio.dataset.bgmPlayback = 'paused';
        } else fadeAudio(audio, 0, Math.min(duration, 180), () => {
          audio.pause();
          audio.dataset.bgmPlayback = 'paused';
        });
      });
      if (enabledRef.current) playScene(activeScene, duration);
    };
    const primeScene = (trackScene: BgmScene) => {
      if (primedScenes.has(trackScene)) return;
      const audio = tracks[trackScene];
      audio.muted = true;
      audio.volume = 0;
      audio.dataset.bgmPlayback = 'priming';
      void audio.play().then(() => {
        primedScenes.add(trackScene);
        if (enabledRef.current && sceneRef.current === trackScene) {
          audio.muted = false;
          syncPlayback(260);
        } else {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
          audio.dataset.bgmPlayback = 'primed';
        }
      }).catch(() => {
        audio.muted = false;
        audio.dataset.bgmPlayback = 'blocked';
      });
    };
    const unlock = () => {
      const activeScene = sceneRef.current;
      TRACK_SCENES.forEach((trackScene) => {
        if (enabledRef.current && trackScene === activeScene) playScene(trackScene, 260);
        else primeScene(trackScene);
      });
    };
    const resumeVisibleTrack = () => {
      if (document.visibilityState === 'visible') syncPlayback(220);
    };
    const handleCanPlay = () => syncPlayback(220);

    syncPlaybackRef.current = syncPlayback;
    TRACK_SCENES.forEach((trackScene) => tracks[trackScene].addEventListener('canplay', handleCanPlay));
    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('keydown', unlock, true);
    document.addEventListener('visibilitychange', resumeVisibleTrack);
    syncPlayback(0);

    return () => {
      syncPlaybackRef.current = () => undefined;
      TRACK_SCENES.forEach((trackScene) => {
        const audio = tracks[trackScene];
        audio.removeEventListener('canplay', handleCanPlay);
        cancelFade(audio);
        audio.pause();
        audio.volume = 0;
        audio.muted = false;
        audio.dataset.bgmPlayback = 'paused';
        audio.remove();
      });
      document.removeEventListener('pointerdown', unlock, true);
      document.removeEventListener('keydown', unlock, true);
      document.removeEventListener('visibilitychange', resumeVisibleTrack);
    };
  }, [runtime]);

  useEffect(() => {
    syncPlaybackRef.current(320);
  }, [enabled, scene]);

  return null;
}
