// Local-calendar-day arithmetic for the exam countdown — shared with the web trainer,
// which draws the same countdown in its sidebar. The rule itself is in
// ccna-exam-simulator/assets/js/shared/localdate.js; this re-exports it so the app's
// imports stay inside src/engine/.
import { daysUntil, isExamDate } from '../../../ccna-exam-simulator/assets/js/shared/localdate.js?v=23';

export { daysUntil, isExamDate };
