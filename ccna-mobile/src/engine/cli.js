// CLI / show-output blocks — the decision half of cliBlock() in app.js, without the
// markup. The screen decides how a collapsed block looks; the engine only says whether
// it should be collapsed and how many lines the summary should advertise.

// Same thresholds as the web app: more than 4 lines, or longer than 220 characters.
const LONG_LINES = 4;
const LONG_CHARS = 220;

export function parseCli(text) {
  if (!text) return null;
  const lines = String(text).split('\n');
  return {
    text: String(text),
    lines,
    long: lines.length > LONG_LINES || String(text).length > LONG_CHARS,
  };
}
