// Readiness and the score forecast — shared with the web trainer, whose dashboard is
// built on the same number. The formula is in
// ccna-exam-simulator/assets/js/shared/readiness.js, where it takes the grading as an
// argument (app.js is a classic script and cannot import a module). This binds the app's
// own isCorrect so every call site inside src/ keeps the signature it always had.
import { isCorrect } from './grade.js';
import {
  UNSEEN_FACTOR, WINDOW,
  readiness as readinessWith, readinessDelta as readinessDeltaWith,
} from '../../../ccna-exam-simulator/assets/js/shared/readiness.js?v=21';

export { UNSEEN_FACTOR, WINDOW };

export const readiness = (attempts, byN, domains, opts = {}) =>
  readinessWith(attempts, byN, domains, isCorrect, opts);

export const readinessDelta = (attempts, byN, domains, sinceMs, opts = {}) =>
  readinessDeltaWith(attempts, byN, domains, isCorrect, sinceMs, opts);
