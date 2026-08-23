import { DEFAULT_PROGRESS } from '../config/catalog';
import { SUPPORTED_LOCALES, type Locale, type PlayerProgress } from '../types/game';

const STORAGE_KEY = 'gamegen-taiwan-mahjong:progress:v1.0.0';

function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && SUPPORTED_LOCALES.includes(value as Locale);
}

export function sanitizeProgress(value: unknown): PlayerProgress {
  if (!value || typeof value !== 'object') return structuredClone(DEFAULT_PROGRESS);
  const source = value as Partial<PlayerProgress>;
  const settings = source.settings ?? DEFAULT_PROGRESS.settings;
  return {
    ...structuredClone(DEFAULT_PROGRESS),
    ...source,
    version: 1,
    coins: Math.max(0, Number.isFinite(source.coins) ? Math.floor(source.coins as number) : DEFAULT_PROGRESS.coins),
    ownedCharacterSkins: Array.isArray(source.ownedCharacterSkins) ? [...new Set(source.ownedCharacterSkins.filter((id): id is string => typeof id === 'string'))] : [...DEFAULT_PROGRESS.ownedCharacterSkins],
    ownedTileBacks: Array.isArray(source.ownedTileBacks) ? [...new Set(source.ownedTileBacks.filter((id): id is string => typeof id === 'string'))] : [...DEFAULT_PROGRESS.ownedTileBacks],
    ownedTables: Array.isArray(source.ownedTables) ? [...new Set(source.ownedTables.filter((id): id is string => typeof id === 'string'))] : [...DEFAULT_PROGRESS.ownedTables],
    totalDraws: Math.max(0, Math.floor(Number(source.totalDraws) || 0)),
    pendingAccessoryChoices: Math.max(0, Math.floor(Number(source.pendingAccessoryChoices) || 0)),
    pendingCharacterChoices: Math.max(0, Math.floor(Number(source.pendingCharacterChoices) || 0)),
    settings: {
      locale: isLocale(settings.locale) ? settings.locale : 'en',
      sfxEnabled: settings.sfxEnabled !== false,
      bgmEnabled: settings.bgmEnabled !== false,
    },
  };
}

export function loadProgress(): PlayerProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? sanitizeProgress(JSON.parse(raw)) : structuredClone(DEFAULT_PROGRESS);
  } catch {
    return structuredClone(DEFAULT_PROGRESS);
  }
}

export function saveProgress(progress: PlayerProgress): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeProgress(progress)));
}
