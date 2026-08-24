// The textbook's data access lives in shared/ — the web trainer reads the same files
// from the same relative path, and "which chapter covers this question" has to be one
// answer, not two. Re-exported here so the screens keep importing '../theory.js'.
export {
  DEFAULT_BOOK, normalizeBook, setBookVersion, isRead, readMap, setRead,
  loadIndex, loadTopic, loadMap, topicOf, coverage,
} from '../../../ccna-exam-simulator/assets/js/shared/theory.js';
