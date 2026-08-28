// The weekly mock exam, and when the two reminders should fire — shared with the web
// trainer, which counts the same weeks in its sidebar. The rules are in
// ccna-exam-simulator/assets/js/shared/plan.js; this re-exports them so the app's imports
// stay inside src/engine/.
import {
  MOCK_EVERY_DAYS, atTime, examDatePassed, lastMock, mockState, nextDailyAt, nextMockAt, parseTime,
} from '../../../ccna-exam-simulator/assets/js/shared/plan.js?v=21';

export { MOCK_EVERY_DAYS, atTime, examDatePassed, lastMock, mockState, nextDailyAt, nextMockAt, parseTime };
