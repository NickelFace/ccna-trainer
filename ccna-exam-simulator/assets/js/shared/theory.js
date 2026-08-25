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
import { normalizeTset, tsetEntries, tsetHas, tsetMark } from './tset.js?v=18';

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
//
// `readOff` is the tombstone half of `read`. Without it, unmarking a chapter did not
// survive: the merge unions read marks by key, so the mark came straight back from the
// other device on the next exchange and the tap looked like it had been ignored. Nothing
// is ever deleted from either map — both only take later timestamps — and a chapter counts
// as read when its mark is younger than its tombstone. Two devices disagreeing therefore
// settle on whichever action happened last, which is the only answer that is not a guess.
export const DEFAULT_BOOK = { read: {}, readOff: {}, pos: {}, open: {}, last: null, scale: 1 };

export const normalizeBook = raw => {
  const b = raw && typeof raw === 'object' ? raw : {};
  const marks = normalizeTset({ on: b.read, off: b.readOff });
  return {
    ...DEFAULT_BOOK,
    ...b,
    read: marks.on,
    readOff: marks.off,
    pos: b.pos && typeof b.pos === 'object' ? b.pos : {},
    open: b.open && typeof b.open === 'object' ? b.open : {},
  };
};

// Reading marks are a tombstoned set — shared/tset.js explains why membership cannot be a
// plain list. The two maps keep the names they were deployed under; the rule itself is the
// same one bookmarks use, and lives in one place so the two cannot drift.
export const isRead = (book, id) => tsetHas(book?.read, book?.readOff, id);
export const readMap = book => tsetEntries(book?.read, book?.readOff);
export const setRead = (book, id, on, now = Date.now()) => tsetMark(book.read, book.readOff, id, on, now);

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

// Question number → where in the book its answer is explained. Used by "теория по этому
// вопросу" beside every graded answer, so it loads on the first one rather than with the
// reader. A value is `topicId`, or `topicId#sectionId` when ccna-book/build.mjs could name
// one section of that chapter with any confidence — read it through the two accessors
// below rather than indexing the map, or the '#' form arrives as a chapter id nothing has.
export function loadMap() {
  mapPromise ||= get(`${BASE}/map.json`).catch(err => { mapPromise = null; throw err; });
  return mapPromise;
}

const entryOf = (map, qn) => map?.[qn] || null;

export const topicOf = (map, qn) => entryOf(map, qn)?.split('#')[0] || null;

// Which section of that chapter, when the build could tell. Null is the common answer and
// not a defect: the chapter on its own is still the place to read.
export const sectionOf = (map, qn) => entryOf(map, qn)?.split('#')[1] || null;

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
