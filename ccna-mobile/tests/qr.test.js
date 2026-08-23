// The QR encoder, against fixtures and against its own invariants.
//
// The fixtures are not hand-derived — nobody reads a QR matrix by eye. They are this
// encoder's output for three inputs, one per version, each first fed through OpenCV's QR
// decoder and confirmed to come back as the text that went in. What they protect against
// is regression: a change that still produces a square but no longer produces *this*
// square has changed something a scanner cares about.
import test from 'node:test';
import assert from 'node:assert/strict';
import { qrMatrix, qrSvg } from '../../ccna-exam-simulator/assets/js/shared/qr.js';

const render = text => qrMatrix(text).map(row => row.map(m => (m ? '#' : '.')).join(''));

const V1 = ['x', [
  '#######.#.....#######',
  '#.....#..#.#..#.....#',
  '#.###.#..#.##.#.###.#',
  '#.###.#.#.##..#.###.#',
  '#.###.#.###.#.#.###.#',
  '#.....#.####..#.....#',
  '#######.#.#.#.#######',
  '........##.##........',
  '#...#.###..#.#####..#',
  '####.......##..#.#.##',
  '#.....####.#..#####..',
  '###....#.#...##.#.#..',
  '##.##.###...###...##.',
  '........#...###...#..',
  '#######.#...##.....#.',
  '#.....#..#.##..#.#.#.',
  '#.###.#.#.##..#######',
  '#.###.#....##..#.#.##',
  '#.###.#..#.#..#####..',
  '#.....#..##..##.#.#..',
  '#######.#.#.###...#.#',
]];

const V2 = ['ccna-sync-key-of-26-chars0', [
  '#######...##..#...#######',
  '#.....#..#####.##.#.....#',
  '#.###.#.#.#....##.#.###.#',
  '#.###.#.#.#..#....#.###.#',
  '#.###.#.#####.#...#.###.#',
  '#.....#.#....###..#.....#',
  '#######.#.#.#.#.#.#######',
  '........#.......#........',
  '#.#####...####.#..#####..',
  '.###.#.#....##..#.....#..',
  '......##..##..####.######',
  '######...#....#.###....#.',
  '..#.#.#....####..##.###.#',
  '####.....#..#...#..#.#...',
  '#.######....##.##...#..##',
  '#..#.....##.#.####.###.#.',
  '#.#.####.#...##.#######.#',
  '........#..###.##...#.#..',
  '#######..##.....#.#.#..##',
  '#.....#.#.###..##...#....',
  '#.###.#.#....########.#..',
  '#.###.#.####.....##.##.##',
  '#.###.#.#.#.#..##..#..#.#',
  '#.....#....##.#.####....#',
  '#######.##...##..##.#.###',
]];

// A real sync key, the size this encoder exists for.
const V3 = ['hjDvIV5fAU_H4o1WnD6r7tfKB4xcLxK3', [
  '#######..#.#.###..###.#######',
  '#.....#..#.#######....#.....#',
  '#.###.#.#..#.#.#..#.#.#.###.#',
  '#.###.#.##.#..##....#.#.###.#',
  '#.###.#.#.##...######.#.###.#',
  '#.....#.#..#.....##.#.#.....#',
  '#######.#.#.#.#.#.#.#.#######',
  '........#..#..#.#..##........',
  '#.#####..#......#...#.#####..',
  '###.##.#########..##..#.##..#',
  '.#.##.#...##.######.....#.#..',
  '##.##..#...###.#..##.#...#.#.',
  '#..#.##...##..##.##.#...#....',
  '.#.##......##..##..######.##.',
  '.#.#..#####.#.........##.#...',
  '..#.....#...#.#.#.###.##.#.##',
  '.#...##..####....#..##.###.##',
  '#...##.#...#####.#.#..####.##',
  '#.##.###.#..#####.#..#.##.#..',
  '#.#....#.#.#.#....#.#..##..#.',
  '#.#####..##.#.####..#########',
  '........###.#.....#.#...##.##',
  '#######..##....####.#.#.##...',
  '#.....#.##.#..#....##...##.#.',
  '#.###.#.##..........#####.##.',
  '#.###.#.####..#####.#..###.##',
  '#.###.#.###...##...##..##.##.',
  '#.....#..##..###..#.#..###.#.',
  '#######.#.#.##..##.#..#.#....',
]];

for (const [text, expected] of [V1, V2, V3]) {
  test(`${expected.length}×${expected.length}: ${text.slice(0, 20)}`, () => {
    assert.deepEqual(render(text), expected);
  });
}

test('the version grows with the payload, and only as far as it has to', () => {
  assert.equal(qrMatrix('a').length, 21);            // version 1
  assert.equal(qrMatrix('a'.repeat(14)).length, 21); // 14 bytes + mode + length fills it
  assert.equal(qrMatrix('a'.repeat(15)).length, 25); // version 2
  assert.equal(qrMatrix('a'.repeat(26)).length, 25);
  assert.equal(qrMatrix('a'.repeat(27)).length, 29); // version 3
  assert.equal(qrMatrix('a'.repeat(42)).length, 29);
});

test('more than it can carry is an error, not a code no scanner can read', () => {
  assert.throws(() => qrMatrix('a'.repeat(43)), /more than this encoder handles/);
});

test('a key with non-ASCII in it still measures itself in bytes', () => {
  // Nothing generates such a key, but a paste can arrive with anything in it — the length
  // that matters is UTF-8 bytes, not characters.
  assert.equal(qrMatrix('я'.repeat(21)).length, 29);
  assert.throws(() => qrMatrix('я'.repeat(22)));
});

test('the three finders and the timing line are where a scanner looks for them', () => {
  const m = qrMatrix('hjDvIV5fAU_H4o1WnD6r7tfKB4xcLxK3');
  const n = m.length;
  for (const [ox, oy] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
    assert.ok(m[oy][ox] && m[oy + 6][ox + 6], 'finder corners are dark');
    assert.ok(!m[oy + 1][ox + 1] && !m[oy + 5][ox + 5], 'and its ring is light');
    assert.ok(m[oy + 3][ox + 3], 'with a dark centre');
  }
  for (let i = 8; i < n - 8; i++) {
    assert.equal(m[6][i], i % 2 === 0, `timing row at ${i}`);
    assert.equal(m[i][6], i % 2 === 0, `timing column at ${i}`);
  }
  assert.ok(m[n - 8][8], 'the module that is always dark');
});

test('the SVG is one path, the right size, and carries the quiet zone', () => {
  const svg = qrSvg('x', { quiet: 4 });
  assert.match(svg, /viewBox="0 0 29 29"/);       // 21 modules plus four each side
  assert.equal(svg.match(/<path/g).length, 1);
  assert.match(svg, /fill="#fff"/);
  assert.doesNotMatch(svg, /<script/i);
});
