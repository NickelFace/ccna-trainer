// CLI / show-output blocks — the decision half of the block, without the markup. The
// screen decides how the block looks; the engine only says whether the output is long
// enough to need a scrolling window instead of growing down the page.
//
// The output is never collapsed behind a tap: it is needed to answer almost every
// question that carries one, so hiding it only adds a step.

// Under the threshold the block grows with its content and gains no inner scroll at all.
// Above it the block becomes a 45vh window (see .cli.windowed) so a 66-line routing table
// cannot push the options off the bottom of the screen.
export const WINDOW_AFTER = 14;

export function parseCli(text) {
  if (!text) return null;
  const lines = String(text).split('\n');
  return {
    text: String(text),
    lines,
    windowed: lines.length > WINDOW_AFTER,
  };
}
