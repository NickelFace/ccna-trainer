// The landing advertises numbers — six domains, their weights, 100 questions, 120 minutes,
// 825 out of 1000 — and the handoff is explicit that nothing may appear there that the
// trainer itself cannot back up. It also cannot read those numbers at runtime: the landing
// paints before the 3 MB bank is fetched, so its config carries its own copy.
//
// This is what keeps the two copies honest. If meta.json is regenerated with different
// weights, or the exam length changes in the engine, the landing stops matching and this
// fails instead of the site quietly claiming something untrue.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBank } from './helpers.js';
import { PASS_SCALED, SCALE_MAX } from '../src/engine/score.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const LANDING = join(HERE, '..', '..', 'ccna-exam-simulator', 'assets', 'js', 'landing.js');

// landing.js is a classic script wrapped in an IIFE, so it cannot be imported. Lift the
// one object literal this test cares about and evaluate that.
function landingConfig() {
  const src = readFileSync(LANDING, 'utf8');
  const start = src.indexOf('const CONFIG = ');
  assert.notEqual(start, -1, 'landing.js no longer declares CONFIG');
  const body = src.slice(start + 'const CONFIG = '.length);
  const end = body.indexOf('\n};');
  assert.notEqual(end, -1, 'could not find the end of the CONFIG literal');
  return new Function(`return ${body.slice(0, end + 2)}`)();
}

const CONFIG = landingConfig();
const { meta } = loadBank();
const exam = CONFIG.modes.find(m => m.mode === 'exam');

test('the landing lists exactly the six blueprint domains, with the blueprint weights', () => {
  const fromMeta = Object.fromEntries(meta.domains.map(d => [d.id, d.weight]));
  const fromLanding = Object.fromEntries(CONFIG.domains.map(d => [d.id, d.weight]));
  assert.deepEqual(fromLanding, fromMeta);
});

test('the weights still add up to a whole exam', () => {
  const sum = CONFIG.domains.reduce((a, d) => a + d.weight, 0);
  assert.equal(Math.round(sum * 100), 100);
});

test('every mode CTA points at a mode the engine knows', () => {
  const engine = new Set(['exam', 'custom', 'practice']);
  for (const m of CONFIG.modes) assert.ok(engine.has(m.mode), `unknown mode ${m.mode}`);
  assert.equal(CONFIG.modes.length, engine.size);
});

// The hero metrics and the featured mode card are rendered straight off these values.
test('the advertised full exam matches what the engine actually starts', () => {
  const app = readFileSync(
    join(HERE, '..', '..', 'ccna-exam-simulator', 'assets', 'js', 'app.js'), 'utf8');
  const call = app.match(/function startFullExam\(\)\s*\{[^}]*weightedPick\((\d+)\)[^}]*beginExam\(qs,\s*(\d+)[,)]/);
  assert.ok(call, 'startFullExam no longer looks the way this test reads it');
  assert.equal(exam.questions, Number(call[1]));
  assert.equal(exam.minutes, Number(call[2]));
});

test('the advertised pass mark matches the scoring scale', () => {
  assert.equal(exam.pass, `${PASS_SCALED} / ${SCALE_MAX}`);
});

test('the download link is the releases page CI actually publishes to', () => {
  const workflow = readFileSync(
    join(HERE, '..', '..', '.github', 'workflows', 'android-release.yml'), 'utf8');
  assert.match(workflow, /make_latest:\s*true/,
    'the landing links to /releases/latest, so CI must keep marking releases latest');
  assert.match(CONFIG.appUrl, /^https:\/\/github\.com\/[\w-]+\/[\w-]+\/releases\/latest$/);
});
