export type MatchEmoteSeat = 0 | 1 | 2 | 3;

export interface MatchEmoteFlight {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  rotation: number;
}

const LANE_HALF_SPAN = 14;
const SEAT_EDGE_DISTANCE = [36, 44] as const;
const DISCARD_ZONE_DISTANCE = [12, 20] as const;

function sample(minimum: number, maximum: number, random: () => number): number {
  return Math.round((minimum + (maximum - minimum) * random()) * 10) / 10;
}

export function createMatchEmoteFlight(seat: MatchEmoteSeat, random: () => number = Math.random): MatchEmoteFlight {
  const lane = sample(-LANE_HALF_SPAN, LANE_HALF_SPAN, random);
  const edgeDistance = sample(SEAT_EDGE_DISTANCE[0], SEAT_EDGE_DISTANCE[1], random);
  const discardDistance = sample(DISCARD_ZONE_DISTANCE[0], DISCARD_ZONE_DISTANCE[1], random);
  const rotation = Math.round((random() - .5) * 22);

  if (seat === 0) return { startX: lane, startY: edgeDistance, endX: lane, endY: discardDistance, rotation };
  if (seat === 1) return { startX: -edgeDistance, startY: lane, endX: -discardDistance, endY: lane, rotation };
  if (seat === 2) return { startX: lane, startY: -edgeDistance, endX: lane, endY: -discardDistance, rotation };
  return { startX: edgeDistance, startY: lane, endX: discardDistance, endY: lane, rotation };
}
