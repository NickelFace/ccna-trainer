#!/usr/bin/env node
// topics/*.md -> the JSON the Теория tab reads, plus the question→chapter binding.
//
// Zero dependencies on purpose: this runs inside `npm run sync-data`, inside the test
// suite and in CI, and none of those should need an install step of their own. The
// Markdown subset is small enough (see README) that a hand-rolled block parser is
// shorter and more predictable than pulling a full CommonMark implementation in.
import { readdir, readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = dirname(fileURLToPath(import.meta.url));
const BANK = join(ROOT, '..', 'ccna-exam-simulator', 'data', 'questions.json');
const META = join(ROOT, '..', 'ccna-exam-simulator', 'data', 'meta.json');

// ---------------------------------------------------------------- frontmatter

// The subset the chapters use: `key: scalar`, `key: [a, b]`, and one level of nesting
// (`match:` with list values). Anything else is a chapter-authoring mistake and says so.
function parseFrontmatter(text, file) {
  if (!text.startsWith('---\n')) throw new Error(`${file}: no frontmatter`);
  const end = text.indexOf('\n---', 3);
  if (end < 0) throw new Error(`${file}: frontmatter is not closed`);
  const head = text.slice(4, end);
  const body = text.slice(text.indexOf('\n', end + 1) + 1);

  const out = {};
  let parent = null;
  for (const raw of head.split('\n')) {
    if (!raw.trim() || raw.trimStart().startsWith('#')) continue;
    const indented = /^\s+/.test(raw);
    const m = raw.trim().match(/^([\w-]+):\s*(.*)$/);
    if (!m) throw new Error(`${file}: cannot read frontmatter line "${raw}"`);
    const [, key, rest] = m;
    const target = indented && parent ? out[parent] : out;
    if (!indented) parent = rest === '' ? key : null;
    if (rest === '') { target[key] = {}; continue; }
    target[key] = parseScalar(rest);
  }
  return { front: out, body };
}

// Quoted strings here are regex sources, and their authors write them the way anyone
// writes a regex inside a JSON/YAML double-quoted string: "\\b" meaning "one backslash,
// then b". Stripping the surrounding quotes without also collapsing that doubled
// backslash leaves the literal two-character sequence in the string, and a regex built
// from it requires an actual backslash in the haystack to match — so `\\bCDP\\b` never
// matches the word "CDP" anywhere, silently. Unescaping `\\` → `\` after unquoting is
// what makes the escape sequence the author typed actually mean what it looks like.
function unquote(s) {
  const quoted = /^"[\s\S]*"$/.test(s) || /^'[\s\S]*'$/.test(s);
  const stripped = s.replace(/^["']|["']$/g, '');
  return quoted ? stripped.replace(/\\\\/g, '\\') : stripped;
}

function parseScalar(s) {
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+$/.test(s)) return Number(s);
  if (s.startsWith('[')) {
    return s.slice(1, s.lastIndexOf(']')).split(',')
      .map(x => unquote(x.trim()))
      .filter(Boolean);
  }
  return unquote(s);
}

// ---------------------------------------------------------------- body blocks

const FENCE = /^```(\w*)\s*$/;
const CALLOUT = /^>\s*\[!(\w+)\]\s*(.*)$/;
const TABLE_SEP = /^\|?[\s:|-]+\|[\s:|-]*$/;

// A chapter is a list of sections; a section is a heading plus its blocks. Sections are
// what the reader shows in the contents list and what reading progress counts, so a
// chapter with no `##` at all is rejected rather than silently rendered as one wall.
export function parseBody(body, file) {
  const lines = body.split('\n');
  const sections = [];
  let current = null;
  const push = block => {
    if (!current) throw new Error(`${file}: content before the first "## " heading`);
    current.blocks.push(block);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    let m;
    if ((m = line.match(/^##\s+(.+)$/))) {
      current = { id: slug(m[1], sections.length), title: m[1].trim(), blocks: [] };
      sections.push(current);
      continue;
    }
    if ((m = line.match(/^###\s+(.+)$/))) { push({ t: 'h3', text: m[1].trim() }); continue; }

    if ((m = line.match(FENCE))) {
      const lang = m[1] || 'txt';
      const buf = [];
      while (++i < lines.length && !FENCE.test(lines[i])) buf.push(lines[i]);
      push(lang === 'check'
        ? { t: 'check', items: parseCheck(buf, file) }
        : { t: 'code', lang, text: buf.join('\n').replace(/\s+$/, '') });
      continue;
    }

    if ((m = line.match(CALLOUT))) {
      const kind = m[1].toLowerCase();
      const buf = m[2] ? [] : [];
      const title = m[2].trim();
      while (i + 1 < lines.length && lines[i + 1].startsWith('>')) {
        buf.push(lines[++i].replace(/^>\s?/, ''));
      }
      push({ t: 'note', kind, title, paras: splitParas(buf) });
      continue;
    }

    if (line.startsWith('|') && TABLE_SEP.test(lines[i + 1] || '')) {
      const head = cells(line);
      const rows = [];
      i++;
      while (i + 1 < lines.length && lines[i + 1].startsWith('|')) rows.push(cells(lines[++i]));
      push({ t: 'table', head, rows });
      continue;
    }

    if (/^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      const ordered = /^\d+\./.test(line);
      const items = [];
      let cur = line.replace(/^([-*]|\d+\.)\s+/, '');
      while (i + 1 < lines.length) {
        const next = lines[i + 1];
        if (/^([-*]|\d+\.)\s+/.test(next)) { items.push(cur); cur = next.replace(/^([-*]|\d+\.)\s+/, ''); i++; }
        else if (/^\s{2,}\S/.test(next)) { cur += ' ' + next.trim(); i++; }   // wrapped item
        else break;
      }
      items.push(cur);
      push({ t: ordered ? 'ol' : 'ul', items });
      continue;
    }

    // Paragraph: consume until a blank line or the start of another block.
    const buf = [line];
    while (i + 1 < lines.length && lines[i + 1].trim()
      && !/^(#{2,3}\s|```|>|\||[-*]\s|\d+\.\s)/.test(lines[i + 1])) buf.push(lines[++i]);
    push({ t: 'p', text: buf.join(' ').trim() });
  }
  return sections;
}

const cells = line => line.replace(/^\||\|$/g, '').split('|').map(c => c.trim());

const splitParas = buf => buf.join('\n').split(/\n\s*\n/).map(s => s.replace(/\n/g, ' ').trim()).filter(Boolean);

// `?? question` / `!! answer`, in pairs. The answer stays hidden until tapped, so an
// orphan `??` would render as a self-check nobody can check.
function parseCheck(buf, file) {
  const items = [];
  for (const raw of buf) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('??')) items.push({ q: line.slice(2).trim(), a: '' });
    else if (line.startsWith('!!')) {
      if (!items.length) throw new Error(`${file}: "!!" answer before any "??" question`);
      items[items.length - 1].a += (items[items.length - 1].a ? ' ' : '') + line.slice(2).trim();
    } else if (items.length) items[items.length - 1].a += ' ' + line;
  }
  const bad = items.find(x => !x.a);
  if (bad) throw new Error(`${file}: self-check "${bad.q}" has no "!!" answer`);
  return items;
}

const slug = (s, i) => s.toLowerCase().replace(/[^a-zа-я0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40) || `s${i}`;

// ---------------------------------------------------------------- chapters

const DOMAINS = ['NF', 'NA', 'IPC', 'IPS', 'SEC', 'AUT'];

// `<id>.md` only — `<id>.en.md` (and any other future `<id>.<locale>.md`) is a translation
// overlay, not a chapter of its own, and is read separately by loadTopicsLocale below.
const CANONICAL_MD = /^[\w-]+\.md$/;

export async function loadTopics(dir = join(ROOT, 'topics')) {
  const files = (await readdir(dir)).filter(f => CANONICAL_MD.test(f)).sort();
  const topics = [];
  for (const file of files) {
    const { front, body } = parseFrontmatter(await readFile(join(dir, file), 'utf8'), file);
    for (const key of ['id', 'dom', 'title', 'lead']) {
      if (!front[key]) throw new Error(`${file}: "${key}" is missing from the frontmatter`);
    }
    if (front.id !== file.replace(/\.md$/, '')) throw new Error(`${file}: id "${front.id}" does not match the file name`);
    if (!DOMAINS.includes(front.dom)) throw new Error(`${file}: unknown domain "${front.dom}"`);
    const sections = parseBody(body, file);
    if (!sections.length) throw new Error(`${file}: no "## " sections`);
    topics.push({
      id: front.id,
      dom: front.dom,
      title: front.title,
      lead: front.lead,
      blueprint: front.blueprint || [],
      minutes: front.minutes || estimateMinutes(sections),
      words: countWords(sections),
      fallback: !!front.fallback,
      // `bank: none` — тема из блюпринта, которой нет в этом дампе вопросов.
      inBank: front.bank !== 'none',
      match: front.match || {},
      sections,
    });
  }
  topics.sort((a, b) => DOMAINS.indexOf(a.dom) - DOMAINS.indexOf(b.dom) || a.id.localeCompare(b.id));
  return topics;
}

const textOf = sections => sections.flatMap(s => [s.title, ...s.blocks.flatMap(blockText)]).join(' ');

function blockText(b) {
  switch (b.t) {
    case 'p': case 'h3': return [b.text];
    case 'ul': case 'ol': return b.items;
    case 'table': return [...b.head, ...b.rows.flat()];
    case 'note': return [b.title, ...b.paras];
    case 'check': return b.items.flatMap(x => [x.q, x.a]);
    case 'code': return [b.text];
    default: return [];
  }
}

const countWords = sections => textOf(sections).split(/\s+/).filter(Boolean).length;
// 130 words/minute for technical Russian, plus a minute per code block for the CLI.
const estimateMinutes = sections =>
  Math.max(5, Math.round(countWords(sections) / 130 + sections.flatMap(s => s.blocks).filter(b => b.t === 'code').length));

// ---------------------------------------------------------------- locale overlays
//
// A translated chapter is `<id>.en.md` beside its Russian original — same id, dom,
// blueprint and match patterns are NOT re-declared there (only `title`/`lead`, and
// optionally `minutes`); the question binding (mapQuestions below) always runs against the
// Russian topics, so a translated chapter can never accidentally change which questions
// it claims. See ccna-book/topics/README (or the CCNA_MOBILE_I18N notes) for the format.
//
// Section ids in the translated body are reassigned from the Russian chapter's own
// sections, positionally, rather than re-slugged from the English headings: map.json's
// `topicId#sectionId` values are computed once, from the Russian text, and a translated
// chapter has to answer to the same ids or every "теория по этому вопросу" deep link into
// it breaks. A chapter whose section count does not match its Russian original cannot be
// mapped this way and is skipped — see loadTopicsLocale's warning — falling back to the
// Russian content for that one chapter rather than shipping a broken jump target.
export async function loadTopicsLocale(ruTopics, dir, locale, warn = console.warn) {
  const overlay = new Map();
  for (const t of ruTopics) {
    const file = join(dir, `${t.id}.${locale}.md`);
    if (!existsSync(file)) {
      warn(`buildBook: no ${locale} translation for ${t.id} — falling back to Russian`);
      continue;
    }
    const { front, body } = parseFrontmatter(await readFile(file, 'utf8'), `${t.id}.${locale}.md`);
    const sections = parseBody(body, `${t.id}.${locale}.md`);
    if (sections.length !== t.sections.length) {
      warn(`buildBook: ${file} has ${sections.length} sections, Russian original has `
        + `${t.sections.length} — section anchors would not line up, falling back to Russian`);
      continue;
    }
    const aligned = sections.map((s, i) => ({ ...s, id: t.sections[i].id }));
    overlay.set(t.id, {
      title: front.title || t.title,
      lead: front.lead || t.lead,
      minutes: front.minutes || estimateMinutes(aligned),
      words: countWords(aligned),
      sections: aligned,
    });
  }
  return overlay;
}

// ---------------------------------------------------------------- question binding

// What a question is searched in. The wording of the stem carries the topic; the options
// and any CLI/topology text confirm it, so they count for less.
const haystacks = q => [
  [`${q.t || ''} ${q.tp || ''}`, 3],
  [Object.values(q.o || {}).join(' '), 1],
  [`${q.cli || ''} ${q.topo || ''}`, 1],
];

// A pattern is a regex source unless it is wrapped in slashes, in which case the slashes
// are stripped first. The wrapping must be on BOTH ends: "/25|/30" is a chapter author
// writing about prefix lengths, and slicing at the first slash there produced a pattern
// with an empty alternative — which matches every question in the bank.
const rx = pat => new RegExp(/^\/.*\/$/.test(pat) ? pat.slice(1, -1) : pat, 'i');

// Two pattern lists, because a chapter about VLANs and a chapter about routing between
// VLANs both legitimately match the word "VLAN". `key` holds the phrases that only this
// chapter can own ("router-on-a-stick", "no switchport") and outweighs any pile-up of
// generic `re` hits; `re` is the supporting evidence.
export function scoreTopic(topic, q, cache) {
  const m = topic.match || {};
  const nots = cache.not.get(topic.id) || [];
  const hay = haystacks(q);
  // `not` reads the question's own topic identity — its stem and tp tag, hay[0] — not the
  // full haystack. A wrong-answer distractor mentioning another chapter's subject ("which
  // switching concept... A) frame flooding B) ... C) spanning-tree protocol D) ...") isn't
  // what the question is about, and vetoing on distractor text silently loses genuine
  // matches whenever an unrelated wrong option happens to name another chapter's keyword.
  if (nots.some(r => r.test(hay[0][0]))) return 0;

  let score = 0;
  if ((m.tp || []).includes(q.tp)) score += 6;
  for (const r of cache.key.get(topic.id) || []) {
    for (const [text, weight] of hay) if (r.test(text)) { score += weight * 4; break; }
  }
  for (const r of cache.re.get(topic.id) || []) {
    for (const [text, weight] of hay) if (r.test(text)) { score += weight; break; }
  }
  return score;
}

// ---------------------------------------------------------------- which section
// A chapter is 2-4 thousand words; "the answer is in this chapter somewhere" is a worse
// answer than a page number. So each question also gets pointed at one section of it —
// derived, never hand-authored, because 1395 questions times a section each is not a list
// anyone would keep true.
//
// Two signals, and the strong one is the author's own work. The chapter's `match` patterns
// are hand-written high-precision phrases; running each of them against each section says
// which section of this chapter owns that phrase, and we already know which of them the
// question matched. Word overlap is the weak signal underneath, for the questions no
// pattern picked out.

// Words worth matching on: three letters or more, or anything with a digit or a dot in it
// (`2WAY`, `224.0.0.5`, `/30`, `802.1X`). The stop list is what every section would share.
const STOP = new Set(`
which what where when does will would should could that this these those with without from
into about over under between during before after have has been being are was were the and
but for not you your его она они это как что где чем для при над под без через между
если или так там тот эта эти этот весь все всё уже ещё чтобы также только более менее
выберите верно неверно вариант варианты ответ ответы вопрос следующих следующее указан
администратор инженер сеть сети сетевой команда команды устройство устройства
`.trim().split(/\s+/));

const terms = text => new Set(
  String(text || '').toLowerCase().match(/[\wа-яё][\wа-яё.\/-]*/g)
    ?.filter(w => (w.length >= 3 || /[\d.]/.test(w)) && !STOP.has(w)) || []);

const sectionHay = s => [s.title, ...s.blocks.flatMap(blockText)].join(' ');

// Enough of a lead over the runner-up to be worth printing. A section named on a coin toss
// sends someone to the wrong page with a straight face, which is worse than naming none —
// the chapter link alone is already useful.
// Tuned by hand against samples of what comes out: tighter than this and two thirds of the
// bank gets no section at all, looser and the pointer starts naming a neighbouring section
// of the right chapter often enough to stop being worth reading. At 5/1.25 about a third
// of the bank is pointed at a section, and the misses land in the right chapter anyway.
const SECTION_MIN = 5;
const SECTION_LEAD = 1.25;

// Every chapter ends with these two, and neither is where an answer is explained: one is a
// list of how the exam words its questions, the other a self-check. They are also the two
// that any lexical scorer picks every time, because "Что спрашивают" is built out of
// paraphrased exam stems — left in, they win in almost every chapter and the pointer stops
// meaning anything. Both stay one tap away in the chapter's own contents.
const TRAILER = new Set(['что спрашивают', 'проверь себя']);
const teaching = sec => !TRAILER.has(sec.title.trim().toLowerCase());

export function pickSection(topic, q, cache) {
  const secs = topic.sections;
  if (secs.length < 2) return secs[0]?.id || null;
  const hays = cache.sec.get(topic.id);
  // The question's own words, plus the text of the *right* answer and nothing else. A stem
  // like "which two statements are true" carries no subject at all, and the correct option
  // is the one sentence that says what this question is actually about. Distractors are
  // deliberately about something else — feeding them in is how a question about hubs ends
  // up pointing at the section on routing tables.
  const right = (q.a || '').split('').map(k => (q.o || {})[k] || '').join(' ');
  const qTerms = terms(`${q.t || ''} ${q.tp || ''} ${right}`);
  const stem = `${q.t || ''} ${q.tp || ''} ${right} ${q.cli || ''}`;

  const scores = secs.map((sec, i) => {
    if (!teaching(sec)) return { id: sec.id, score: 0 };
    let score = 0;
    // The author's phrases: a `key` pattern that matches both the question and this
    // section is the strongest thing available, and `re` is the same idea one notch down.
    for (const r of cache.key.get(topic.id) || []) {
      if (r.test(stem) && r.test(hays[i].text)) score += 5;
    }
    for (const r of cache.re.get(topic.id) || []) {
      if (r.test(stem) && r.test(hays[i].text)) score += 2;
    }
    // Word overlap. Counted once per distinct term, so a long section cannot win on
    // volume; a hit in the heading counts for more because that is what the section is
    // announced as being about.
    for (const w of qTerms) {
      if (hays[i].title.has(w)) score += 3;
      else if (hays[i].terms.has(w)) score += 1;
    }
    return { id: sec.id, score };
  }).sort((a, b) => b.score - a.score);

  const [top, next] = scores;
  if (top.score < SECTION_MIN) return null;
  if (next && next.score && top.score < next.score * SECTION_LEAD) return null;
  return top.id;
}

// Every question gets exactly one chapter: the best-scoring one inside its own domain,
// or that domain's fallback chapter when nothing matched. A domain with no fallback and
// an unmatched question is a build error — that is the whole promise of this folder.
//
// The value is `topicId`, or `topicId#sectionId` when a section could be named with any
// confidence. One string rather than a second file: shared/theory.js splits it, and the
// map is fetched on the first "теория по этому вопросу" tap on both clients.
export function mapQuestions(topics, questions) {
  const cache = { key: new Map(), re: new Map(), not: new Map(), sec: new Map() };
  for (const t of topics) {
    cache.key.set(t.id, (t.match.key || []).map(rx));
    cache.re.set(t.id, (t.match.re || []).map(rx));
    cache.not.set(t.id, (t.match.not || []).map(rx));
    // Each section's searchable form, built once: every question in this chapter is scored
    // against all of them, and re-tokenising 3000 words per question is minutes of build.
    cache.sec.set(t.id, t.sections.map(sec => ({
      text: sectionHay(sec), title: terms(sec.title), terms: terms(sectionHay(sec)),
    })));
  }
  const byDom = new Map(DOMAINS.map(d => [d, topics.filter(t => t.dom === d)]));
  const map = {};
  const perTopic = new Map(topics.map(t => [t.id, []]));
  const stats = { matched: 0, fallback: 0, orphan: 0, orphanDomains: new Set(), sectioned: 0 };

  for (const q of questions) {
    const pool = byDom.get(q.dom) || [];
    let best = null, bestScore = 0;
    for (const t of pool) {
      const s = scoreTopic(t, q, cache);
      if (s > bestScore) { best = t; bestScore = s; }
    }
    if (!best) {
      best = pool.find(t => t.fallback) || null;
      if (best) stats.fallback++;
      else { stats.orphan++; stats.orphanDomains.add(q.dom); continue; }
    } else stats.matched++;
    const sec = pickSection(best, q, cache);
    if (sec) stats.sectioned++;
    map[q.n] = sec ? `${best.id}#${sec}` : best.id;
    perTopic.get(best.id).push(q.n);
  }
  return { map, perTopic, stats };
}

// ---------------------------------------------------------------- emit

// `locale` swaps the *content* shipped in `index`/`bodies` (title, lead, section text) for
// a translated one when available — never the question binding: `map`/`stats` are always
// computed from the Russian topics (their `match` patterns are the canonical, hand-tuned
// ones — see the module note at the top of this file), so a translated chapter can never
// steer questions differently than its Russian original does.
export async function buildBook({ dir, bankPath = BANK, metaPath = META, locale = 'ru' } = {}) {
  const topics = await loadTopics(dir);
  const questions = JSON.parse(await readFile(bankPath, 'utf8'));
  const meta = JSON.parse(await readFile(metaPath, 'utf8'));
  const { map, perTopic, stats } = mapQuestions(topics, questions);

  const overlay = locale === 'ru' ? null : await loadTopicsLocale(topics, dir || join(ROOT, 'topics'), locale);
  const content = topics.map(t => {
    const o = overlay?.get(t.id);
    return o ? { ...t, ...o } : t;
  });
  const missing = overlay ? topics.filter(t => !overlay.has(t.id)).length : 0;

  const index = {
    v: 1,
    locale,
    builtFrom: { questions: questions.length },
    domains: meta.domains.map(d => ({
      id: d.id,
      name: d.name,
      topics: content.filter(t => t.dom === d.id).map(t => t.id),
    })),
    topics: content.map(t => ({
      id: t.id,
      dom: t.dom,
      title: t.title,
      lead: t.lead,
      blueprint: t.blueprint,
      minutes: t.minutes,
      words: t.words,
      sections: t.sections.map(s => ({ id: s.id, title: s.title })),
      inBank: t.inBank,
      qn: perTopic.get(t.id).length,
    })),
  };

  const bodies = new Map(content.map(t => [t.id, {
    id: t.id,
    dom: t.dom,
    title: t.title,
    lead: t.lead,
    minutes: t.minutes,
    blueprint: t.blueprint,
    sections: t.sections,
    qs: perTopic.get(t.id),
  }]));

  return { topics: content, index, bodies, map, stats: { ...stats, missingTranslations: missing }, questions };
}

export function coverageReport({ topics, index, stats, questions }) {
  const byId = new Map(index.topics.map(t => [t.id, t]));
  const lines = [
    '# Покрытие банка вопросов главами учебника',
    '',
    `Вопросов в банке: **${questions.length}** · глав: **${topics.length}** ·`
    + ` по ключевым словам легло **${stats.matched}**, в общую главу домена — **${stats.fallback}**`
    + ` · с точным разделом **${stats.sectioned}**`
    + (stats.orphan ? ` · **без главы: ${stats.orphan}**` : ''),
    '',
    '| Глава | Домен | Вопросов | Слов | Минут |',
    '|---|---|---:|---:|---:|',
  ];
  for (const t of topics) {
    const i = byId.get(t.id);
    lines.push(`| ${t.title} | ${t.dom} | ${i.qn} | ${i.words} | ${i.minutes} |`);
  }
  const thin = topics.filter(t => t.inBank && byId.get(t.id).qn < 5).map(t => t.id);
  const offBank = topics.filter(t => !t.inBank).map(t => t.id);
  const short = topics.filter(t => byId.get(t.id).words < 900).map(t => t.id);
  lines.push('', thin.length ? `Мало вопросов (<5): ${thin.join(', ')}` : 'Глав без вопросов нет.');
  if (offBank.length) lines.push(`Тема блюпринта, которой нет в банке: ${offBank.join(', ')}`);
  if (short.length) lines.push(`Короткие главы (<900 слов): ${short.join(', ')}`);
  return lines.join('\n');
}

// `out/map.json` is locale-independent (see the buildBook note) and lands directly under
// `out`; `index.json` and the chapter bodies are locale-specific and nest under
// `out/<locale>/`, so RU and EN builds can be written side by side without one clobbering
// the other — see sync-data.mjs, which calls this once per locale.
export async function writeBook(out, book, locale = 'ru') {
  const localeDir = join(out, locale);
  await rm(join(localeDir, 't'), { recursive: true, force: true });
  await mkdir(join(localeDir, 't'), { recursive: true });
  await writeFile(join(localeDir, 'index.json'), JSON.stringify(book.index));
  await writeFile(join(out, 'map.json'), JSON.stringify(book.map));
  for (const [id, body] of book.bodies) {
    await writeFile(join(localeDir, 't', `${id}.json`), JSON.stringify(body));
  }
}

// ---------------------------------------------------------------- cli

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = process.argv.slice(2);
  const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : join(ROOT, 'dist');
  const strict = args.includes('--strict');
  // No --locale: build both. Each writeBook call nests under out/<locale>/ and shares one
  // out/map.json (see writeBook) — sync-data.mjs does the same two calls for the app build.
  const locales = args.includes('--locale') ? [args[args.indexOf('--locale') + 1]] : ['ru', 'en'];

  let book;
  for (const locale of locales) {
    book = await buildBook({ locale });
    await writeBook(out, book, locale);
    if (book.stats.missingTranslations) {
      console.warn(`build: ${book.stats.missingTranslations} chapter(s) have no ${locale} translation yet — served in Russian`);
    }
  }
  // Coverage is about the question↔chapter binding, which is locale-independent — one
  // report, from whichever locale built last, is enough.
  const report = coverageReport(book);
  await writeFile(join(out, 'coverage.md'), report + '\n');
  console.log(report);
  console.log(`\nwritten → ${out} (${locales.join(', ')})`);
  if (strict && book.stats.orphan) {
    console.error(`\n${book.stats.orphan} question(s) in ${[...book.stats.orphanDomains].join(', ')} have no chapter`);
    process.exit(1);
  }
}
