import { useEffect, useRef } from 'react';
import { ASSETS } from '../config/assets';
import type { PlatformRuntime } from './resourceLoader';

const CLICKABLE_SELECTOR = 'button, a[href], [role="button"], [data-ui-sfx]';
const SPECIAL_SELECTOR = [
  '[data-ui-sfx="special"]',
  '.gacha-actions button',
  '.milestone-choice-panel .collection-card',
].join(',');
const MAHJONG_SFX_EVENT = 'astranova:mahjong-sfx';

export type MahjongSfxName = 'tileDiscard' | 'tileHover' | 'tileArrange' | 'special' | 'ready' | 'win';

export function playMahjongSfx(name: MahjongSfxName): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<MahjongSfxName>(MAHJONG_SFX_EVENT, { detail: name }));
}

function createAudio(source: string, volume: number): HTMLAudioElement {
  const audio = new Audio(source);
  audio.preload = 'auto';
  audio.volume = volume;
  return audio;
}

function isUnavailable(control: HTMLElement): boolean {
  return control.matches(':disabled, [aria-disabled="true"], .locked');
}

export function UiSfxPlayer({ runtime, enabled }: { runtime: PlatformRuntime; enabled: boolean }) {
  const enabledRef = useRef(enabled);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    if (typeof Audio === 'undefined') return undefined;

    const clickAudio = createAudio(runtime.resolveAsset(ASSETS.sfxUiClick), 0.52);
    const invalidAudio = createAudio(runtime.resolveAsset(ASSETS.sfxUiInvalid), 0.58);
    const specialAudio = createAudio(runtime.resolveAsset(ASSETS.sfxUiSpecial), 0.66);
    const readyAudio = createAudio(runtime.resolveAsset(ASSETS.sfxReady), 0.72);
    const winAudio = createAudio(runtime.resolveAsset(ASSETS.sfxWin), 0.76);
    const tileDiscardAudio = createAudio(runtime.resolveAsset(ASSETS.sfxTileDiscard), 0.9);
    const tileHoverAudio = createAudio(runtime.resolveAsset(ASSETS.sfxTileHover), 1);
    const tileArrangeAudio = createAudio(runtime.resolveAsset(ASSETS.sfxTileArrange), 1);
    const audioPlayers = [clickAudio, invalidAudio, specialAudio, readyAudio, winAudio, tileDiscardAudio, tileHoverAudio, tileArrangeAudio];

    const replay = (audio: HTMLAudioElement, force = false) => {
      if (!enabledRef.current && !force) return;
      audio.pause();
      audio.currentTime = 0;
      void audio.play().catch(() => undefined);
    };

    const findControl = (target: EventTarget | null): HTMLElement | null =>
      target instanceof Element ? target.closest<HTMLElement>(CLICKABLE_SELECTOR) : null;

    const handlePointerDown = (event: PointerEvent) => {
      const control = findControl(event.target);
      if (control && isUnavailable(control)) replay(invalidAudio);
    };

    const handleClick = (event: MouseEvent) => {
      const control = findControl(event.target);
      if (!control || isUnavailable(control)) return;
      replay(control.matches(SPECIAL_SELECTOR) ? specialAudio : clickAudio, control.hasAttribute('data-ui-sfx-toggle'));
    };

    const handleMahjongSfx = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      if (event.detail === 'tileDiscard') replay(tileDiscardAudio);
      if (event.detail === 'tileHover') replay(tileHoverAudio);
      if (event.detail === 'tileArrange') replay(tileArrangeAudio);
      if (event.detail === 'special') replay(specialAudio);
      if (event.detail === 'ready') replay(readyAudio);
      if (event.detail === 'win') replay(winAudio);
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('click', handleClick, true);
    window.addEventListener(MAHJONG_SFX_EVENT, handleMahjongSfx);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('click', handleClick, true);
      window.removeEventListener(MAHJONG_SFX_EVENT, handleMahjongSfx);
      audioPlayers.forEach((audio) => {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      });
    };
  }, [runtime]);

  return null;
}
