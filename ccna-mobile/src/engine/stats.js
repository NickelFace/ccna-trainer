// Derived statistics over the attempt history.
//
// All of it is shared with the web trainer (assets/js/shared/progress.js) — the phone and
// the browser show the same weak topics and the same streak because they run the same
// code. The only thing bound here is grading: the shared module takes isCorrect as a
// parameter so it does not drag a module-only import into the web app's classic script.
import { isCorrect } from './grade.js';
import {
  toneFor, scoreTone, msPerQuestion, scaledDelta, pointsToPass, isScored, scoredAttempts,
  weakDomains, dayStats, answeredOn, answeredTotal, recentDays, streakDays,
  topicStats as topicStatsWith, weakTopics as weakTopicsWith, mistakesOf as mistakesOfWith,
} from '../../../ccna-exam-simulator/assets/js/shared/progress.js?v=13';
import { dayKey, daySum, normalizeActivity } from '../../../ccna-exam-simulator/assets/js/shared/activity.js?v=13';

export { dayKey, normalizeActivity, daySum };
export {
  toneFor, scoreTone, msPerQuestion, scaledDelta, pointsToPass, isScored, scoredAttempts,
  weakDomains, dayStats, answeredOn, answeredTotal, recentDays, streakDays,
};

export const topicStats = (attempts, byN) => topicStatsWith(attempts, byN, isCorrect);
export const weakTopics = (attempts, byN, opts) => weakTopicsWith(attempts, byN, isCorrect, opts);
export const mistakesOf = (attempt, byN) => mistakesOfWith(attempt, byN, isCorrect);
