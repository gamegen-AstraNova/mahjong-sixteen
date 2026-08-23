import type { MahjongState, MeldKind } from './mahjong';

export type MatchSeat = 0 | 1 | 2 | 3;
export type MatchActionKind = MeldKind | 'ready' | 'win' | 'selfDraw';

export interface MatchActionSignal {
  seat: MatchSeat;
  kind: MatchActionKind;
}

export function detectMatchActionSignals(previous: MahjongState, current: MahjongState): MatchActionSignal[] {
  const signals: MatchActionSignal[] = [];

  for (let seat = 0; seat < 4; seat += 1) {
    const matchSeat = seat as MatchSeat;
    const previousMelds = previous.players[seat]?.melds ?? [];
    const currentMelds = current.players[seat]?.melds ?? [];
    const addedMelds = currentMelds.slice(previousMelds.length);
    addedMelds.forEach((meld) => signals.push({ seat: matchSeat, kind: meld.kind }));
    const upgradedToKong = currentMelds.some((meld, index) => meld.kind === 'kong' && previousMelds[index]?.kind === 'pong');
    if (upgradedToKong) signals.push({ seat: matchSeat, kind: 'kong' });

    if (!previous.readyDeclared[seat] && current.readyDeclared[seat]) {
      signals.push({ seat: matchSeat, kind: 'ready' });
    }
  }

  if (!previous.settlement && current.settlement && current.winner !== null) {
    signals.push({
      seat: current.winner as MatchSeat,
      kind: current.winnerBy === 'selfDraw' ? 'selfDraw' : 'win',
    });
  }

  return signals;
}

export function matchActionDuration(kind: MatchActionKind): number {
  return kind === 'win' || kind === 'selfDraw' ? 2_500 : 1_000;
}
