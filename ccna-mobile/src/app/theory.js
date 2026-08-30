// The textbook's data access lives in shared/ — the web trainer reads the same files
// from the same relative path, and "which chapter covers this question" has to be one
// answer, not two. Re-exported here so the screens keep importing '../theory.js'.
//
// ccna-book/build.mjs writes one content tree per locale (dist/data/theory/ru/,
// dist/data/theory/en/) sharing a single, locale-independent dist/data/theory/map.json —
// see that file's module note for why the question↔chapter binding itself never varies by
// language. loadIndex/loadTopic go through the current locale's tree; loadMap always reads
// the shared one. Falling back to Russian when an English chapter is missing happens at
// build time (ccna-book/build.mjs), not here — every id in the EN tree resolves to
// *something*, translated or not.
import {
  DEFAULT_BOOK, normalizeBook, setBookVersion, isRead, readMap, setRead,
  loadIndex as sharedLoadIndex, loadTopic as sharedLoadTopic, loadMap as sharedLoadMap,
  topicOf, sectionOf, coverage,
} from '../../../ccna-exam-simulator/assets/js/shared/theory.js?v=23';
import { getLang } from './i18n.js';

export { DEFAULT_BOOK, normalizeBook, setBookVersion, isRead, readMap, setRead, topicOf, sectionOf, coverage };

const BASE = 'data/theory';
const localeBase = () => `${BASE}/${getLang()}`;

export const loadIndex = () => sharedLoadIndex(localeBase());
export const loadTopic = id => sharedLoadTopic(id, localeBase());
export const loadMap = () => sharedLoadMap(BASE);
