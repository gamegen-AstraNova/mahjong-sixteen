import { describe, expect, it } from 'vitest';
import { CHARACTER_IDS, CHARACTER_SKINS, DEFAULT_PROGRESS, OUTFIT_THEME_SLUGS, TABLES, TILE_BACKS, floorBackgroundForOutfit, lobbyBackgroundForOutfit } from './catalog';

describe('character catalog', () => {
  it('registers nineteen unique GameGen assets for each character', () => {
    expect(CHARACTER_SKINS).toHaveLength(57);
    expect(new Set(CHARACTER_SKINS.map((skin) => skin.relativePath)).size).toBe(57);

    for (const characterId of CHARACTER_IDS) {
      const skins = CHARACTER_SKINS.filter((skin) => skin.characterId === characterId);
      expect(skins).toHaveLength(19);
      expect(skins.map((skin) => skin.outfitNumber)).toEqual(Array.from({ length: 19 }, (_, index) => index + 1));
      expect(skins.every((skin) => /^textures\/sym_character_(asteria|lumi|nyx)_outfit_\d+\.png$/.test(skin.relativePath))).toBe(true);
    }
  });

  it('keeps the three starter outfits compatible with existing save ids', () => {
    expect(DEFAULT_PROGRESS.ownedCharacterSkins).toEqual(['aya_1', 'mio_1', 'sora_1']);
  });

  it('registers nineteen theme-linked tile backs, tables, lobby backgrounds, and match floors', () => {
    expect(TILE_BACKS).toHaveLength(19);
    expect(TABLES).toHaveLength(19);
    expect(new Set(TILE_BACKS.map((item) => item.relativePath)).size).toBe(19);
    expect(new Set(TABLES.map((item) => item.relativePath)).size).toBe(19);

    OUTFIT_THEME_SLUGS.forEach((theme, index) => {
      expect(TILE_BACKS[index].relativePath).toBe(`textures/panel_tile_back_${theme}.png`);
      expect(TABLES[index].relativePath).toBe(`textures/bg_table_${theme}.png`);
      expect(lobbyBackgroundForOutfit(index + 1)).toBe(`textures/bg_lobby_${theme}.png`);
      expect(floorBackgroundForOutfit(index + 1)).toBe(`textures/bg_floor_${theme}.webp`);
    });
  });

  it('keeps Daily as the initially owned and selected equipment theme', () => {
    expect(DEFAULT_PROGRESS.ownedTileBacks).toEqual(['tile_back_1']);
    expect(DEFAULT_PROGRESS.ownedTables).toEqual(['table_1']);
    expect(DEFAULT_PROGRESS.selectedTileBack).toBe('tile_back_1');
    expect(DEFAULT_PROGRESS.selectedTable).toBe('table_1');
  });
});
