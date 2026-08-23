// Scoring — Cisco reports 300..1000 with 825 to pass; the map from raw percentage is
// linear. The rounding order matters and is preserved exactly: the percentage is rounded
// to a whole number FIRST, and the scaled score is computed from that rounded value.
// 73/100 gives pct 73 and scaled 811 — computing from the unrounded ratio would drift by
// a point, and the two clients would report different scores for the same answers.

export const PASS_SCALED = 825;
export const SCALE_MIN = 300;
export const SCALE_MAX = 1000;

export const toScaled = pct => Math.round(SCALE_MIN + (pct / 100) * (SCALE_MAX - SCALE_MIN));
