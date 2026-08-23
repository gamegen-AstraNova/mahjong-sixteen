import type { MatchActionKind, MatchSeat } from './game/matchActionEvents';
import './MatchActionCallout.css';

interface MatchActionCalloutProps {
  seat: MatchSeat;
  kind: MatchActionKind;
  label: string;
  imageSrc: string;
}

export function MatchActionCallout({ seat, kind, label, imageSrc }: MatchActionCalloutProps) {
  return (
    <div
      className={`match-action-callout match-action-seat-${seat} match-action-kind-${kind}`}
      role="status"
      aria-live="assertive"
      aria-label={label}
    >
      <div className="match-action-impact">
        <img src={imageSrc} alt="" aria-hidden="true" />
      </div>
    </div>
  );
}
