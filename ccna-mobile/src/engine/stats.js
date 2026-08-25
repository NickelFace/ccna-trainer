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
  isAbandoned, answeredIn,
  topicStats as topicStatsWith, weakTopics as weakTopicsWith, mistakesOf as mistakesOfWith,
  perDomainOf as perDomainOfWith,
} from '../../../ccna-exam-simulator/assets/js/shared/progress.js?v=19';
import { dayKey, daySum, normalizeActivity } from '../../../ccna-exam-simulator/assets/js/shared/activity.js?v=19';

export { dayKey, normalizeActivity, daySum };
export {
  toneFor, scoreTone, msPerQuestion, scaledDelta, pointsToPass, isScored, scoredAttempts,
  weakDomains, dayStats, answeredOn, answeredTotal, recentDays, streakDays,
  isAbandoned, answeredIn,
};

export const topicStats = (attempts, byN) => topicStatsWith(attempts, byN, isCorrect);
export const weakTopics = (attempts, byN, opts) => weakTopicsWith(attempts, byN, isCorrect, opts);
export const mistakesOf = (attempt, byN) => mistakesOfWith(attempt, byN, isCorrect);
export const perDomainOf = (attempt, byN) => perDomainOfWith(attempt, byN, isCorrect);
