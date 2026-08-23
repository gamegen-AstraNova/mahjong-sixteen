export const SUPPORTED_LOCALES = ['en', 'zh-TW', 'zh-CN', 'ja'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export type CharacterId = 'aya' | 'mio' | 'sora';
export type EquipmentKind = 'tileBack' | 'table';

export interface CharacterSkin {
  id: string;
  characterId: CharacterId;
  outfitNumber: number;
  relativePath: string;
}

export interface EquipmentItem {
  id: string;
  kind: EquipmentKind;
  variantNumber: number;
  theme: string;
  relativePath: string;
}

export interface PlayerSettings {
  locale: Locale;
  sfxEnabled: boolean;
  bgmEnabled: boolean;
}

export interface PlayerProgress {
  version: 1;
  coins: number;
  ownedCharacterSkins: string[];
  ownedTileBacks: string[];
  ownedTables: string[];
  selectedCharacterSkin: string;
  selectedTileBack: string;
  selectedTable: string;
  totalDraws: number;
  pendingAccessoryChoices: number;
  pendingCharacterChoices: number;
  dailyRewardKey: string | null;
  dailyFreeTenKey: string | null;
  settings: PlayerSettings;
}

export type GachaReward =
  | { kind: 'character'; itemId: string; duplicate: boolean; refund: number }
  | { kind: 'tileBack'; itemId: string; duplicate: boolean; refund: number }
  | { kind: 'table'; itemId: string; duplicate: boolean; refund: number }
  | { kind: 'coins'; amount: 77 | 777 | 7777 };
