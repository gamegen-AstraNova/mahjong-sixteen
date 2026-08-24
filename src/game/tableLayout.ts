import type { Meld, TileId } from './mahjong';

export interface MeldTileLayout {
  tile: TileId;
  faceDown: boolean;
  meldIndex: number;
  tileIndex: number;
  slot: number;
  stacked: boolean;
  open: true;
}

export function layoutMeldTiles(melds: Meld[]): MeldTileLayout[] {
  let slotOffset = 0;
  return melds.flatMap((meld, meldIndex) => {
    const stackFourthTile = meld.kind === 'kong' && !meld.concealed;
    const entries = meld.tiles.map((tile, tileIndex) => ({
      tile,
      faceDown: meld.concealed && (tileIndex === 0 || tileIndex === meld.tiles.length - 1),
      meldIndex,
      tileIndex,
      slot: slotOffset + (stackFourthTile && tileIndex === 3 ? 1 : tileIndex),
      stacked: stackFourthTile && tileIndex === 3,
      open: true as const,
    }));
    slotOffset += stackFourthTile ? 3 : meld.tiles.length;
    return entries;
  });
}
