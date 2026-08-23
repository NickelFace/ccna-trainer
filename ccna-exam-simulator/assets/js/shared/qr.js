// A QR code for the sync key, and nothing else.
//
// Typing 32 random characters into a phone is the worst part of setting sync up, so the
// site draws the key as a square the phone can look at. That needs an encoder, and an
// encoder is the one place in this project where the code is spec-shaped rather than
// problem-shaped: ISO/IEC 18004, byte mode, error correction level M.
//
// It is deliberately small. Versions 1 to 3 only — up to 42 bytes, where a sync key is 32 —
// so there is a single error-correction block and none of the interleaving that larger
// codes need, and no version-information modules (those start at version 7). Anything
// longer throws rather than silently producing a code no scanner will read.
//
// Checked by decoding what it produces: 47 codes across all three versions, every padding
// path and a spread of random keys, fed through OpenCV's QR decoder and compared with the
// text that went in. Three of those are frozen as fixtures in qr.test.js.
//
// It does not always pick the same mask as other encoders. The mask is chosen by the
// standard's four penalty scores, and the third of them — the finder-lookalike rule — is
// worded loosely enough that implementations disagree at the symbol's edges. Every mask
// yields a valid, readable code; which one wins is cosmetic.

// Data codewords and error-correction codewords per version at level M. One block each.
const VERSIONS = [
  { version: 1, data: 16, ec: 10 },
  { version: 2, data: 28, ec: 16 },
  { version: 3, data: 44, ec: 26 },
];

// ---------------------------------------------------------------- GF(256)
// The field the Reed-Solomon codewords live in: bytes, with multiplication modulo the
// polynomial x^8 + x^4 + x^3 + x^2 + 1 (0x11d). Logs turn that into table lookups.
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x = (x << 1) ^ (x & 0x80 ? 0x11d : 0);
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}

const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

// ∏ (x − α^i) for i < degree, highest power first.
function generator(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const byX = [...poly, 0];
    const byRoot = [0, ...poly.map(c => mul(c, EXP[i]))];
    poly = byX.map((c, j) => c ^ byRoot[j]);
  }
  return poly;
}

// The remainder of data·x^degree divided by the generator — the error-correction codewords.
function remainder(data, degree) {
  const gen = generator(degree);
  const out = new Uint8Array(degree);
  for (const byte of data) {
    const factor = byte ^ out[0];
    out.copyWithin(0, 1);
    out[degree - 1] = 0;
    for (let i = 0; i < degree; i++) out[i] ^= mul(gen[i + 1], factor);
  }
  return out;
}

// ---------------------------------------------------------------- codewords

function codewords(bytes) {
  const spec = VERSIONS.find(v => bytes.length + 2 <= v.data);   // +2: mode nibble and length byte
  if (!spec) throw new Error(`qr: ${bytes.length} bytes is more than this encoder handles`);

  const bits = [];
  const push = (value, width) => {
    for (let i = width - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };

  push(0b0100, 4);            // byte mode
  push(bytes.length, 8);      // character count, 8 bits up to version 9
  for (const b of bytes) push(b, 8);

  const capacity = spec.data * 8;
  push(0, Math.min(4, capacity - bits.length));   // terminator, short if it does not fit
  while (bits.length % 8) bits.push(0);

  const data = new Uint8Array(spec.data);
  for (let i = 0; i < bits.length; i++) data[i >>> 3] |= bits[i] << (7 - (i & 7));
  // The standard's filler, alternating, from the first unused codeword to the end.
  for (let i = bits.length / 8, pad = 0; i < spec.data; i++, pad++) data[i] = pad % 2 ? 0x11 : 0xec;

  return { spec, all: [...data, ...remainder(data, spec.ec)] };
}

// ---------------------------------------------------------------- the grid

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x, y) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

const grid = size => Array.from({ length: size }, () => new Array(size).fill(false));

function drawFunctionPatterns(modules, reserved, size, version) {
  const set = (x, y, dark) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    modules[y][x] = dark;
    reserved[y][x] = true;
  };

  // Timing: the alternating line that tells a scanner where the module grid falls.
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }

  // Three finders with their separators — the squares that make a QR recognisable.
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        set(cx + dx, cy + dy, d !== 2 && d !== 4);
      }
    }
  }

  // One alignment pattern from version 2 on, in the bottom-right quadrant.
  if (version >= 2) {
    const c = 4 * version + 10;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        set(c + dx, c + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  // Reserve the format-information strips; the values go in once the mask is chosen. Index
  // 6 is skipped in both: that cell belongs to the timing line, which the format strip
  // steps over rather than interrupts.
  for (let i = 0; i < 9; i++) {
    if (i === 6) continue;
    set(8, i, false);
    set(i, 8, false);
  }
  for (let i = 0; i < 8; i++) { set(size - 1 - i, 8, false); set(8, size - 1 - i, false); }
  set(8, size - 8, true);   // the module that is always dark
}

// Level M and the mask, protected by a BCH(15,5) code and masked so an all-zero pattern
// cannot occur.
function drawFormat(modules, size, mask) {
  const data = (0b00 << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = (((data << 10) | rem) ^ 0x5412) & 0x7fff;
  const bit = i => ((bits >>> i) & 1) === 1;

  for (let i = 0; i <= 5; i++) modules[i][8] = bit(i);
  modules[7][8] = bit(6);
  modules[8][8] = bit(7);
  modules[8][7] = bit(8);
  for (let i = 9; i < 15; i++) modules[8][14 - i] = bit(i);

  for (let i = 0; i < 8; i++) modules[8][size - 1 - i] = bit(i);
  for (let i = 8; i < 15; i++) modules[size - 15 + i][8] = bit(i);
}

// Two modules wide, bottom to top and back again, skipping the vertical timing line.
function drawData(modules, reserved, size, bytes) {
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (reserved[y][x] || i >= bytes.length * 8) continue;
        modules[y][x] = ((bytes[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
        i++;
      }
    }
  }
}

// The four penalties from the standard. Their only job is to pick between the eight masks,
// so what matters is that they agree with every other encoder, not what they mean.
function penalty(modules, size) {
  let score = 0;

  const run = line => {
    let total = 0;
    let colour = line[0];
    let length = 1;
    for (let i = 1; i <= size; i++) {
      if (i < size && line[i] === colour) { length++; continue; }
      if (length >= 5) total += 3 + (length - 5);
      if (i < size) { colour = line[i]; length = 1; }
    }
    return total;
  };

  const finderish = line => {
    let total = 0;
    for (let i = 0; i + 6 < size; i++) {
      const core = [1, 0, 1, 1, 1, 0, 1].every((v, k) => line[i + k] === !!v);
      if (!core) continue;
      const before = line.slice(Math.max(0, i - 4), i);
      const after = line.slice(i + 7, i + 11);
      if (before.length === 4 && before.every(v => !v)) total += 40;
      if (after.length === 4 && after.every(v => !v)) total += 40;
    }
    return total;
  };

  for (let y = 0; y < size; y++) {
    const row = modules[y];
    const col = modules.map(r => r[y]);
    score += run(row) + run(col) + finderish(row) + finderish(col);
  }

  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = modules[y][x];
      if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) score += 3;
    }
  }

  const dark = modules.flat().filter(Boolean).length;
  const percent = (dark * 100) / (size * size);
  score += 10 * Math.floor(Math.abs(percent - 50) / 5);

  return score;
}

// The finished code as rows of booleans, true meaning a dark module. No quiet zone — that
// belongs to whoever draws it.
export function qrMatrix(text) {
  const bytes = new TextEncoder().encode(text);
  const { spec, all } = codewords(bytes);
  const size = 4 * spec.version + 17;

  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const modules = grid(size);
    const reserved = grid(size);
    drawFunctionPatterns(modules, reserved, size, spec.version);
    drawData(modules, reserved, size, all);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!reserved[y][x] && MASKS[mask](x, y)) modules[y][x] = !modules[y][x];
      }
    }
    drawFormat(modules, size, mask);
    const score = penalty(modules, size);
    if (!best || score < best.score) best = { score, modules };
  }
  return best.modules;
}

// One path for every dark module — a few hundred rectangles as one element, which scales to
// any size and needs no canvas. `quiet` is in modules: the standard asks for four, and
// scanners do fail without it.
export function qrSvg(text, { quiet = 4, className = '' } = {}) {
  const modules = qrMatrix(text);
  const size = modules.length + quiet * 2;
  const path = [];
  modules.forEach((row, y) => row.forEach((dark, x) => {
    if (dark) path.push(`M${x + quiet} ${y + quiet}h1v1h-1z`);
  }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"${className ? ` class="${className}"` : ''} shape-rendering="crispEdges" role="img">`
    + `<rect width="${size}" height="${size}" fill="#fff"/>`
    + `<path d="${path.join('')}" fill="#000"/></svg>`;
}
