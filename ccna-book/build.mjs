#!/usr/bin/env node
// topics/*.md -> the JSON the Теория tab reads, plus the question→chapter binding.
//
// Zero dependencies on purpose: this runs inside `npm run sync-data`, inside the test
// suite and in CI, and none of those should need an install step of their own. The
// Markdown subset is small enough (see README) that a hand-rolled block parser is
// shorter and more predictable than pulling a full CommonMark implementation in.
import { readdir, readFile, mkdir, writeFile, rm } from 'node:fs/promises';
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

function parseScalar(s) {
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+$/.test(s)) return Number(s);
  if (s.startsWith('[')) {
    return s.slice(1, s.lastIndexOf(']')).split(',')
      .map(x => x.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }
  return s.replace(/^["']|["']$/g, '');
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

export async function loadTopics(dir = join(ROOT, 'topics')) {
  const files = (await readdir(dir)).filter(f => f.endsWith('.md')).sort();
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

// ---------------------------------------------------------------- question binding

// What a question is searched in. The wording of the stem carries the topic; the options
// and any CLI/topology text confirm it, so they count for less.
const haystacks = q => [
  [`${q.t || ''} ${q.tp || ''}`, 3],
  [Object.values(q.o || {}).join(' '), 1],
  [`${q.cli || ''} ${q.topo || ''}`, 1],
];

const rx = pat => new RegExp(pat.startsWith('/') ? pat.slice(1, pat.lastIndexOf('/')) : escapeRe(pat), 'i');
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function scoreTopic(topic, q, cache) {
  const m = topic.match || {};
  const nots = cache.not.get(topic.id) || [];
  const hay = haystacks(q);
  if (nots.some(r => hay.some(([text]) => r.test(text)))) return 0;

  let score = 0;
  if ((m.tp || []).includes(q.tp)) score += 8;
  for (const r of cache.re.get(topic.id) || []) {
    for (const [text, weight] of hay) if (r.test(text)) { score += weight; break; }
  }
  return score;
}

// Every question gets exactly one chapter: the best-scoring one inside its own domain,
// or that domain's fallback chapter when nothing matched. A domain with no fallback and
// an unmatched question is a build error — that is the whole promise of this folder.
export function mapQuestions(topics, questions) {
  const cache = { re: new Map(), not: new Map() };
  for (const t of topics) {
    cache.re.set(t.id, (t.match.re || []).map(rx));
    cache.not.set(t.id, (t.match.not || []).map(rx));
  }
  const byDom = new Map(DOMAINS.map(d => [d, topics.filter(t => t.dom === d)]));
  const map = {};
  const perTopic = new Map(topics.map(t => [t.id, []]));
  const stats = { matched: 0, fallback: 0, orphan: 0, orphanDomains: new Set() };

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
    map[q.n] = best.id;
    perTopic.get(best.id).push(q.n);
  }
  return { map, perTopic, stats };
}

// ---------------------------------------------------------------- emit

export async function buildBook({ dir, bankPath = BANK, metaPath = META } = {}) {
  const topics = await loadTopics(dir);
  const questions = JSON.parse(await readFile(bankPath, 'utf8'));
  const meta = JSON.parse(await readFile(metaPath, 'utf8'));
  const { map, perTopic, stats } = mapQuestions(topics, questions);

  const index = {
    v: 1,
    builtFrom: { questions: questions.length },
    domains: meta.domains.map(d => ({
      id: d.id,
      name: d.name,
      topics: topics.filter(t => t.dom === d.id).map(t => t.id),
    })),
    topics: topics.map(t => ({
      id: t.id,
      dom: t.dom,
      title: t.title,
      lead: t.lead,
      blueprint: t.blueprint,
      minutes: t.minutes,
      words: t.words,
      sections: t.sections.map(s => ({ id: s.id, title: s.title })),
      qn: perTopic.get(t.id).length,
    })),
  };

  const bodies = new Map(topics.map(t => [t.id, {
    id: t.id,
    dom: t.dom,
    title: t.title,
    lead: t.lead,
    minutes: t.minutes,
    blueprint: t.blueprint,
    sections: t.sections,
    qs: perTopic.get(t.id),
  }]));

  return { topics, index, bodies, map, stats, questions };
}

export function coverageReport({ topics, index, stats, questions }) {
  const byId = new Map(index.topics.map(t => [t.id, t]));
  const lines = [
    '# Покрытие банка вопросов главами учебника',
    '',
    `Вопросов в банке: **${questions.length}** · глав: **${topics.length}** ·`
    + ` по ключевым словам легло **${stats.matched}**, в общую главу домена — **${stats.fallback}**`
    + (stats.orphan ? ` · **без главы: ${stats.orphan}**` : ''),
    '',
    '| Глава | Домен | Вопросов | Слов | Минут |',
    '|---|---|---:|---:|---:|',
  ];
  for (const t of topics) {
    const i = byId.get(t.id);
    lines.push(`| ${t.title} | ${t.dom} | ${i.qn} | ${i.words} | ${i.minutes} |`);
  }
  const thin = topics.filter(t => byId.get(t.id).qn < 5).map(t => t.id);
  const short = topics.filter(t => byId.get(t.id).words < 900).map(t => t.id);
  lines.push('', thin.length ? `Мало вопросов (<5): ${thin.join(', ')}` : 'Глав без вопросов нет.');
  if (short.length) lines.push(`Короткие главы (<900 слов): ${short.join(', ')}`);
  return lines.join('\n');
}

export async function writeBook(out, book) {
  await rm(join(out, 't'), { recursive: true, force: true });
  await mkdir(join(out, 't'), { recursive: true });
  await writeFile(join(out, 'index.json'), JSON.stringify(book.index));
  await writeFile(join(out, 'map.json'), JSON.stringify(book.map));
  for (const [id, body] of book.bodies) {
    await writeFile(join(out, 't', `${id}.json`), JSON.stringify(body));
  }
}

// ---------------------------------------------------------------- cli

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = process.argv.slice(2);
  const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : join(ROOT, 'dist');
  const strict = args.includes('--strict');
  const book = await buildBook({});
  await writeBook(out, book);
  const report = coverageReport(book);
  await writeFile(join(out, 'coverage.md'), report + '\n');
  console.log(report);
  console.log(`\nwritten → ${out}`);
  if (strict && book.stats.orphan) {
    console.error(`\n${book.stats.orphan} question(s) in ${[...book.stats.orphanDomains].join(', ')} have no chapter`);
    process.exit(1);
  }
}
