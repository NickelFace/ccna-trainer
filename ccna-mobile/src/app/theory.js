// The textbook's data access: an index of chapters, one chapter body at a time, and the
// question → chapter map.
//
// None of it is loaded at boot. The bank alone is 2.9 MB and the app must be on screen
// fast; the book is only needed once the Теория tab is opened, and a chapter body only
// when that chapter is. Everything fetched is kept — a re-read costs nothing after the
// first, and the whole book is a few hundred kilobytes.
const BASE = 'data/theory';

let indexPromise = null;
let mapPromise = null;
const bodies = new Map();

const get = url => fetch(url).then(r => {
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
});

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
// so it loads on the first tap there rather than with the tab.
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
