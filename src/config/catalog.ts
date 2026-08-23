import type { CharacterId, CharacterSkin, EquipmentItem, PlayerProgress } from '../types/game';

export const CHARACTER_IDS: CharacterId[] = ['aya', 'mio', 'sora'];

export const OUTFIT_THEME_SLUGS = [
  'daily',
  'streaming',
  'outing',
  'vacation',
  'swimsuit',
  'uniform',
  'magic_academy',
  'classic_maid',
  'modern_maid',
  'waiter',
  'dancer',
  'cheerleader',
  'singer',
  'idol',
  'magical_girl',
  'nursing',
  'adventurer',
  'racing',
  'historical',
] as const;

const CHARACTER_ASSET_NAMES: Record<CharacterId, string> = {
  aya: 'asteria',
  mio: 'lumi',
  sora: 'nyx',
};

export const CHARACTER_SKINS: CharacterSkin[] = CHARACTER_IDS.flatMap((characterId) =>
  OUTFIT_THEME_SLUGS.map((_, index) => ({
    id: `${characterId}_${index + 1}`,
    characterId,
    outfitNumber: index + 1,
    relativePath: `textures/sym_character_${CHARACTER_ASSET_NAMES[characterId]}_outfit_${index + 1}.png`,
  })),
);

export const TILE_BACKS: EquipmentItem[] = OUTFIT_THEME_SLUGS.map((theme, index) => ({
  id: `tile_back_${index + 1}`,
  kind: 'tileBack',
  variantNumber: index + 1,
  theme,
  relativePath: `textures/panel_tile_back_${theme}.png`,
}));

export const TABLES: EquipmentItem[] = OUTFIT_THEME_SLUGS.map((theme, index) => ({
  id: `table_${index + 1}`,
  kind: 'table',
  variantNumber: index + 1,
  theme,
  relativePath: `textures/bg_table_${theme}.png`,
}));

export function lobbyBackgroundForOutfit(outfitNumber: number): string {
  const theme = OUTFIT_THEME_SLUGS[outfitNumber - 1] ?? OUTFIT_THEME_SLUGS[0];
  return `textures/bg_lobby_${theme}.png`;
}

export interface UiThemePalette {
  accent: string;
  accentDeep: string;
  secondary: string;
  tintRgb: string;
}

export const UI_THEME_PALETTES: UiThemePalette[] = [
  { accent: '#2f8e9d', accentDeep: '#236978', secondary: '#f08c72', tintRgb: '232 248 247' },
  { accent: '#6d67c6', accentDeep: '#4f4a9c', secondary: '#48b9c6', tintRgb: '241 239 253' },
  { accent: '#258f78', accentDeep: '#1f6f62', secondary: '#f08f61', tintRgb: '235 249 244' },
  { accent: '#178caf', accentDeep: '#146c88', secondary: '#f58b72', tintRgb: '230 248 252' },
  { accent: '#1589b5', accentDeep: '#0e6a91', secondary: '#f08eae', tintRgb: '228 247 252' },
  { accent: '#397cb8', accentDeep: '#2b6092', secondary: '#e69375', tintRgb: '235 244 251' },
  { accent: '#656fb7', accentDeep: '#4b568f', secondary: '#df8c70', tintRgb: '241 243 251' },
  { accent: '#5166aa', accentDeep: '#3e4f86', secondary: '#e4aa5d', tintRgb: '235 240 252' },
  { accent: '#388f87', accentDeep: '#2b6f69', secondary: '#e99b70', tintRgb: '237 248 245' },
  { accent: '#3f887e', accentDeep: '#316a63', secondary: '#db8d5d', tintRgb: '239 247 244' },
  { accent: '#9a4f83', accentDeep: '#783e67', secondary: '#e2a64e', tintRgb: '250 237 245' },
  { accent: '#247fc2', accentDeep: '#1a6197', secondary: '#f08a58', tintRgb: '231 245 254' },
  { accent: '#5a6ca9', accentDeep: '#445485', secondary: '#d99f56', tintRgb: '239 242 251' },
  { accent: '#5964bd', accentDeep: '#444d95', secondary: '#d85f9e', tintRgb: '238 240 253' },
  { accent: '#8668bd', accentDeep: '#674e98', secondary: '#e27cab', tintRgb: '247 239 252' },
  { accent: '#2c8c9d', accentDeep: '#226c7a', secondary: '#e37f88', tintRgb: '234 248 250' },
  { accent: '#487e6a', accentDeep: '#365f50', secondary: '#d79254', tintRgb: '241 246 241' },
  { accent: '#2476c4', accentDeep: '#1b5b99', secondary: '#e95f72', tintRgb: '231 241 253' },
  { accent: '#287f76', accentDeep: '#1f625b', secondary: '#e19a62', tintRgb: '235 247 244' },
];

export function uiThemeForOutfit(outfitNumber: number): UiThemePalette {
  return UI_THEME_PALETTES[outfitNumber - 1] ?? UI_THEME_PALETTES[0];
}

export const DEFAULT_PROGRESS: PlayerProgress = {
  version: 1,
  coins: 100_000,
  ownedCharacterSkins: ['aya_1', 'mio_1', 'sora_1'],
  ownedTileBacks: ['tile_back_1'],
  ownedTables: ['table_1'],
  selectedCharacterSkin: 'aya_1',
  selectedTileBack: 'tile_back_1',
  selectedTable: 'table_1',
  totalDraws: 0,
  pendingAccessoryChoices: 0,
  pendingCharacterChoices: 0,
  dailyRewardKey: null,
  dailyFreeTenKey: null,
  settings: {
    locale: 'en',
    sfxEnabled: true,
    bgmEnabled: true,
  },
};
