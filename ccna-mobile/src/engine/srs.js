// Spaced repetition — Leitner boxes, as specified in the handoff.
//
// Both halves live in the shared modules the imports below point at: srs.js owns the
// transition of one graded answer, srs-queue.js owns reading the whole map. The web
// trainer runs the same code, so the two clients cannot promote or schedule a question
// differently.
//
// State per question: { box: 1..5, dueAt, lastResult, seenCount, at }.
import { INTERVAL_DAYS, MAX_BOX, DAY_MS, intervalMs, nextState } from '../../../ccna-exam-simulator/assets/js/shared/srs.js?v=20';
import { isDue, dueQueue, dueCount, nextDueAt, boxHistogram, pruneGhosts } from '../../../ccna-exam-simulator/assets/js/shared/srs-queue.js?v=20';

export { INTERVAL_DAYS, MAX_BOX, DAY_MS, intervalMs, nextState };
export { isDue, dueQueue, dueCount, nextDueAt, boxHistogram, pruneGhosts };
