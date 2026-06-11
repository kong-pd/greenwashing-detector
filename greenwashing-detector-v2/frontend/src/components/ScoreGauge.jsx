// ScoreGauge.jsx — exportable ScoreGauge component.
// Wraps ScoreDial with automatic size/variant selection based on container context.
import { ScoreDial, riskBand, bandColor } from "./SharedComponents.jsx";

/**
 * ScoreGauge — drop-in score visualiser.
 *
 * Props:
 *   score    {number}  0–100
 *   variant  {"arc"|"bar"|"letter"}  default "arc"
 *   size     {number}  diameter/width hint in px, default 200
 *   showBand {boolean} show risk band label below gauge, default true
 */
export default function ScoreGauge({ score, variant = "arc", size = 200, showBand = true }) {
  if (score == null) return null;
  const band = riskBand(score);

  return (
    <div className="score-gauge-wrap">
      <ScoreDial score={score} variant={variant} size={size} />
      {showBand && variant !== "letter" && (
        <div className="score-gauge-band mono small" style={{ color: bandColor(band.tone) }}>
          {band.label} · {band.range}
        </div>
      )}
    </div>
  );
}
