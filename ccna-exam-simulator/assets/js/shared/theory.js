// The textbook's data access: an index of chapters, one chapter body at a time, and the
// question → chapter map.
//
// None of it is loaded at boot. The bank alone is 2.9 MB and the app must be on screen
// fast; the book is only needed once the reader is opened, and a chapter body only when
// that chapter is. Everything fetched is kept — a re-read costs nothing after the first,
// and the whole book is a bit over a megabyte.
//
// Shared by both clients. The path is relative in both: the APK serves its bundled copy
// from the web root, and the site serves data/theory/ from the same directory as the
// bank. What differs is caching — the phone reads a file it shipped with, the browser
// reads over HTTP from Pages — hence the version stamp below.
const BASE = 'data/theory';

// GitHub Pages answers with a cache lifetime of its own, so a rebuilt chapter would keep
// serving the old JSON for as long as the browser has it. The site sets this to the same
// stamp it puts on questions.json; the app never calls it and fetches unstamped.
let stamp = '';
export const setBookVersion = v => { stamp = v ? `?v=${encodeURIComponent(v)}` : ''; };

let indexPromise = null;
let mapPromise = null;
const bodies = new Map();

const get = url => fetch(url + stamp).then(r => {
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
});

// The textbook branch of the store, and what a missing or half-written one becomes.
// Both stores keep it in this shape and merge() moves it whole, so it is defined once.
export const DEFAULT_BOOK = { read: {}, pos: {}, open: {}, last: null, scale: 1 };

export const normalizeBook = raw => {
  const b = raw && typeof raw === 'object' ? raw : {};
  return {
    ...DEFAULT_BOOK,
    ...b,
    read: b.read && typeof b.read === 'object' ? b.read : {},
    pos: b.pos && typeof b.pos === 'object' ? b.pos : {},
    open: b.open && typeof b.open === 'object' ? b.open : {},
  };
};

export function loadIndex() {
  indexPromise ||= get(`${BASE}/index.json`).then(idx => {
    idx.byId = new Map(idx.topics.map(t => [t.id, t]));
    return idx;
  }).catch(err => { indexPromise = null; throw err; });
  return indexPromise;
}

export function loadTopic(id) {
  if (!bodies.has(id)) {
    bodies.set(id, get(`${BASE}/t/${id}.json`).catch(err => { bodies.delete(id); throw err; }));
  }
  return bodies.get(id);
}

// Question number → chapter id. Used by "теория по этому вопросу" in the review sheet,
// so it loads on the first tap there rather than with the reader.
export function loadMap() {
  mapPromise ||= get(`${BASE}/map.json`).catch(err => { mapPromise = null; throw err; });
  return mapPromise;
}

export const topicOf = (map, qn) => map?.[qn] || null;

// How much of the bank the chapters marked read cover. This is the number that makes the
// textbook worth reading in a trainer: not "8 of 47 chapters" but "412 questions of 1395
// are now backed by something you have read".
// The denominator is the whole bank, not the questions the chapters happen to cover —
// while the book is still being written those two differ, and the honest number is the
// one measured against everything that can be asked.
export function coverage(index, read) {
  const total = index.builtFrom?.questions || index.topics.reduce((a, t) => a + t.qn, 0) || 1;
  const done = index.topics.filter(t => read[t.id]).reduce((a, t) => a + t.qn, 0);
  return { done, total, pct: Math.round((done / total) * 100) };
}
