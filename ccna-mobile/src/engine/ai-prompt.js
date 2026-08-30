// The prompt builder is shared with the web trainer and lives there — see the header on
// ccna-exam-simulator/assets/js/shared/ai-prompt.js. This re-exports it so the app's
// imports stay '../engine/…' like every other rule module (cf. plan.js, localdate.js).
export {
  LEVELS, LEVELS_EN, PROMPT_PARTS, PROMPT_PARTS_EN,
  questionText, defaultParts, questionToText, buildPrompt,
} from '../../../ccna-exam-simulator/assets/js/shared/ai-prompt.js?v=23';
