// English/Russian string table for the whole app.
//
// The web app's I18N table (ccna-exam-simulator/assets/js/app.js) hides Russian prose in
// EN mode instead of translating it — a deliberate choice explained there. This app makes
// the opposite one: content is actually translated (see the `_en` fields on the bank and
// the ccna-book/topics/*.en.md chapters), so the UI layer here has to carry both languages
// for real, not just swap chrome labels.
//
// Persistence lives in store.profile.lang (Capacitor Preferences), not localStorage — that
// is this app's one persistence layer, and sync ships the profile across devices already.
// setLang() re-renders the whole tree (router.render + renderTabs) so the switch is instant,
// no restart, matching the web app's setLang().
import { store } from './store.js';

// ---------------------------------------------------------------- plural rules
// Russian: three forms (один вопрос / два вопроса / пять вопросов). English: two (1 question
// / 5 questions). Both take the *last two digits* of n, matching the web app's RU_PLURAL.
const ruPluralIndex = n => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 0;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 1;
  return 2;
};
const enPluralIndex = n => (n === 1 ? 0 : 1);

// ---------------------------------------------------------------- current language
// A plain module-level variable, mirrored into store.profile.lang. Screens read it through
// t()/tn()/getLang() rather than the store directly, so nothing has to know where it is
// persisted.
let current = 'ru';

export function getLang() { return current; }

// Called once at boot, from the loaded profile — does not persist or render, just adopts
// what is already there.
export function initLang(lang) { current = lang === 'en' ? 'en' : 'ru'; }

// Called from the Language switch in Профиль/Profile and from onboarding step 3. Persists,
// then hands back to the caller to repaint — the caller has the router in scope, this
// module deliberately does not depend on it.
export function setLang(lang) {
  const next = lang === 'en' ? 'en' : 'ru';
  if (next === current) return current;
  current = next;
  store.patchProfile({ lang: next });
  store.flush();
  return current;
}

// ---------------------------------------------------------------- lookup
const fmt = (str, vars) => vars
  ? str.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m))
  : str;

// Plain string lookup. Falls back to Russian (never to the bare key) if a translation is
// somehow missing, then to the key itself as a last resort — a missing string should be
// obvious in testing, not a crash on a phone.
export function t(key, vars) {
  const row = STRINGS[key];
  if (!row) return key;
  const raw = row[current] ?? row.ru ?? key;
  return fmt(raw, vars);
}

// A bare pluralized *word* (not a whole sentence) — "день/дня/дней" or "day/days" — for
// dropping into a {placeholder} of a t() template. Russian grammatical case varies by
// sentence (accusative here, dative there), which is why this takes the word forms
// directly rather than a shared dictionary keyed by English gloss: a shared "days" entry
// could only ever hold one Russian case, and most of these sentences need several.
export function pluralWord(n, forms) {
  const list = forms[current] ?? forms.ru;
  const idx = current === 'ru' ? ruPluralIndex(n) : enPluralIndex(n);
  return list[Math.min(idx, list.length - 1)];
}

// The handful of noun forms reused across more than one screen. Anything used in exactly
// one place stays inline at the call site instead of growing this list.
export const WORDS = {
  days: { ru: ['день', 'дня', 'дней'], en: ['day', 'days'] },
  daysAcc: { ru: ['день', 'дня', 'дней'], en: ['day', 'days'] },
  questions: { ru: ['вопрос', 'вопроса', 'вопросов'], en: ['question', 'questions'] },
  questionsDat: { ru: ['вопросу', 'вопроса', 'вопросов'], en: ['question', 'questions'] },
  answers: { ru: ['ответ', 'ответа', 'ответов'], en: ['answer', 'answers'] },
  mistakes: { ru: ['ошибка', 'ошибки', 'ошибок'], en: ['mistake', 'mistakes'] },
  points: { ru: ['балл', 'балла', 'баллов'], en: ['point', 'points'] },
  attemptsAcc: { ru: ['попытку', 'попытки', 'попыток'], en: ['attempt', 'attempts'] },
  items: { ru: ['элемент', 'элемента', 'элементов'], en: ['item', 'items'] },
  slots: { ru: ['место', 'места', 'мест'], en: ['slot', 'slots'] },
  daysStreak: { ru: ['день подряд', 'дня подряд', 'дней подряд'], en: ['day in a row', 'days in a row'] },
};

// ---------------------------------------------------------------- string table
// One flat namespace, keys prefixed by screen. Every value is `{ ru, en }` (or ru/en arrays
// for tn()). Nothing here is a fragment meant to be concatenated by the caller — favour a
// whole-sentence key with {placeholders} over stitching pieces together, the same rule the
// original Russian copy already followed.
const STRINGS = {
  // ---- tabs ----
  'tab.home': { ru: 'Главная', en: 'Home' },
  'tab.theory': { ru: 'Теория', en: 'Theory' },
  'tab.learn': { ru: 'Учить', en: 'Learn' },
  'tab.exam': { ru: 'Экзамен', en: 'Exam' },
  'tab.progress': { ru: 'Прогресс', en: 'Progress' },

  // ---- common ----
  'common.cancel': { ru: 'Отмена', en: 'Cancel' },
  'common.start': { ru: 'Начать', en: 'Start' },
  'common.back': { ru: 'Назад', en: 'Back' },
  'common.next': { ru: 'Дальше', en: 'Next' },
  'common.done': { ru: 'Готово', en: 'Done' },
  'common.yes': { ru: 'Да', en: 'Yes' },
  'common.startSession.title': { ru: 'Начать новую сессию?', en: 'Start a new session?' },
  'common.startTraining.title': { ru: 'Начать тренировку?', en: 'Start practice?' },
  'common.unfinishedLost': { ru: 'Незаконченная сессия будет потеряна.', en: 'The unfinished session will be lost.' },

  // ---- boot error ----
  'boot.failTitle': { ru: 'Не удалось запуститься', en: 'Failed to start' },
  'boot.failBody': { ru: '{message}. Проверь, что перед сборкой отработал <code>npm run sync-data</code>.', en: '{message}. Make sure <code>npm run sync-data</code> ran before the build.' },

  // ---- onboarding ----
  'onboarding.step': { ru: 'Шаг {step} из {total}', en: 'Step {step} of {total}' },
  'onboarding.level.title': { ru: 'С чего начинаешь?', en: 'Where are you starting from?' },
  'onboarding.level.lead': { ru: 'От этого зависит, как ИИ будет объяснять разбор ошибок.', en: 'This shapes how the AI explains your mistakes.' },
  'onboarding.level.hint': { ru: 'Поменять можно в любой момент: главная → «план · изменить». Ничего не пересчитывается задним числом.', en: 'You can change this any time: Home → "plan · edit". Nothing is recalculated retroactively.' },
  'onboarding.level.first.title': { ru: 'Первый раз', en: 'First attempt' },
  'onboarding.level.first.note': { ru: 'CCNA ещё не сдавал', en: "Haven't taken the CCNA yet" },
  'onboarding.level.again.title': { ru: 'Готовился раньше', en: 'Studied before' },
  'onboarding.level.again.note': { ru: 'база есть, нужно освежить', en: 'have the basics, need a refresh' },
  'onboarding.level.retake.title': { ru: 'Пересдача', en: 'Retaking it' },
  'onboarding.level.retake.note': { ru: 'знаю, где провалился', en: 'know where I fell short' },
  'onboarding.date.title': { ru: 'Когда экзамен?', en: 'When is the exam?' },
  'onboarding.date.lead': { ru: 'От даты зависит дневная норма и приоритет плана.', en: 'The date drives your daily quota and what the plan prioritizes.' },
  'onboarding.date.hint': { ru: 'Точную дату и норму задаёшь в «Профиле»: главная → «план · изменить». Там же виден обратный отсчёт.', en: 'Set the exact date and quota in Profile: Home → "plan · edit". The countdown lives there too.' },
  'onboarding.date.2w.title': { ru: 'Через 2 недели', en: 'In 2 weeks' },
  'onboarding.date.2w.note': { ru: 'спринт · 60 вопросов в день', en: 'sprint · 60 questions a day' },
  'onboarding.date.1m.title': { ru: 'Через месяц', en: 'In a month' },
  'onboarding.date.1m.note': { ru: '30 вопросов в день · 1 пробный в неделю', en: '30 questions a day · 1 mock exam a week' },
  'onboarding.date.3m.title': { ru: 'Через 3 месяца и больше', en: 'In 3 months or more' },
  'onboarding.date.3m.note': { ru: 'спокойный темп · 15 вопросов в день', en: 'steady pace · 15 questions a day' },
  'onboarding.date.none.title': { ru: 'Даты пока нет', en: 'No date yet' },
  'onboarding.date.none.note': { ru: 'без нормы, только тренировка', en: 'no quota, just practice' },
  'onboarding.lang.title': { ru: 'Язык интерфейса', en: 'Interface language' },
  'onboarding.lang.lead': { ru: 'Меняет язык приложения. Вопросы банка на английском в обоих случаях; разбор и теория переведены.', en: 'Changes the app language. Bank questions are in English either way; rationale and theory are translated.' },
  'onboarding.lang.hint': { ru: 'Поменять можно в любой момент: Профиль → «Язык».', en: 'You can change this any time: Profile → "Language".' },
  'onboarding.lang.ru': { ru: 'Русский', en: 'Russian' },
  'onboarding.lang.ru.note': { ru: 'интерфейс и разбор на русском', en: 'interface and rationale in Russian' },
  'onboarding.lang.en': { ru: 'English', en: 'English' },
  'onboarding.lang.en.note': { ru: 'интерфейс и разбор на английском', en: 'interface and rationale in English' },

  // ---- home ----
  'home.mode.exam': { ru: 'Пробный экзамен', en: 'Mock exam' },
  'home.mode.practice': { ru: 'Тренировка', en: 'Practice' },
  'home.mode.srs': { ru: 'Повторение', en: 'Review' },
  'home.ago.now': { ru: 'только что', en: 'just now' },
  'home.ago.min': { ru: '{n} мин назад', en: '{n} min ago' },
  'home.ago.hr': { ru: '{n} ч назад', en: '{n} h ago' },
  'home.ago.day': { ru: '{n} дн назад', en: '{n}d ago' },
  'home.readiness.title': { ru: 'Готовность {pct}%', en: 'Readiness {pct}%' },
  'home.readiness.titleEmpty': { ru: 'Готовность —', en: 'Readiness —' },
  'home.readiness.planEdit': { ru: 'план · изменить', en: 'plan · edit' },
  'home.readiness.examDateNone': { ru: 'дата экзамена не задана', en: 'exam date not set' },
  'home.readiness.examDatePassed': { ru: 'дата экзамена прошла, {n} {days} назад', en: 'exam date passed {n} {days} ago' },
  'home.readiness.examToday': { ru: 'экзамен сегодня', en: 'exam is today' },
  'home.readiness.examIn': { ru: 'экзамен через {n} {days}', en: 'exam in {n} {days}' },
  'home.readiness.threshold': { ru: 'порог 825', en: 'pass mark 825' },
  'result.thresholdLabel': { ru: 'порог {n}', en: 'pass mark {n}' },
  'home.readiness.forecastHint': { ru: 'Прогноз появится после первых ответов: он считается по последним 200 ответам, взвешенным по шести доменам Cisco.', en: 'The forecast appears once you have answered a few — it is computed from the last 200 answers, weighted across the six Cisco domains.' },
  'home.readiness.forecast': { ru: 'прогноз {n} / 1000', en: 'forecast {n} / 1000' },
  'home.readiness.bySample': { ru: 'по {n} {answers}', en: 'from {n} {answers}' },
  'home.readiness.deltaWeek': { ru: '{sign}{n} за неделю', en: '{sign}{n} this week' },
  'home.resume.title': { ru: 'Продолжить', en: 'Continue' },
  'home.resume.question': { ru: '{mode} · вопрос {i} из {total}', en: '{mode} · question {i} of {total}' },
  'home.resume.timeLeft': { ru: 'осталось {clock}', en: '{clock} left' },
  'home.resume.timeUp': { ru: 'время вышло', en: 'time is up' },
  'home.resume.savedAgo': { ru: 'сохранено {ago}', en: 'saved {ago}' },
  'home.resume.viewResult': { ru: 'Посмотреть результат', en: 'View result' },
  'home.resume.return': { ru: 'Вернуться', en: 'Resume' },
  'home.plan.today': { ru: 'План на сегодня · {today} из {goal}', en: "Today's plan · {today} of {goal}" },
  'home.plan.mock.due': { ru: 'Пробный экзамен', en: 'Mock exam' },
  'home.plan.mock.dueLast': { ru: 'последний {n} {days} назад — пора', en: 'last one {n} {days} ago — time for another' },
  'home.plan.mock.dueNever': { ru: 'ещё не проходил — одна попытка покажет расклад по доменам', en: "haven't taken one yet — a single attempt shows where you stand per domain" },
  'home.plan.mock.done': { ru: 'Пробный экзамен пройден', en: 'Mock exam done' },
  'home.plan.mock.doneNote': { ru: 'следующий через {n} {days}', en: 'next one in {n} {days}' },
  'home.plan.srs.title': { ru: 'Повторить ошибки', en: 'Review mistakes' },
  'home.plan.srs.note': { ru: 'вопросы, у которых подошёл срок повтора', en: 'questions due for another look' },
  'home.plan.srs.doneTitle': { ru: 'Всё повторено', en: 'All caught up' },
  'home.plan.srs.nextTomorrow': { ru: 'следующий повтор завтра', en: 'next review tomorrow' },
  'home.plan.srs.nextIn': { ru: 'следующий повтор через {n} {days}', en: 'next review in {n} {days}' },
  'home.plan.srs.nextEmpty': { ru: 'здесь появятся вопросы, в которых ошибёшься', en: "questions you miss will show up here" },
  'home.plan.weakest': { ru: 'самый слабый домен по последним ответам', en: 'weakest domain in your recent answers' },
  'home.plan.dd.title': { ru: 'Тренажёр сопоставлений', en: 'Matching drill' },
  'home.plan.dd.noteDone': { ru: 'сопоставления тапом, 10 вопросов', en: 'tap-to-match, 10 questions' },
  'home.plan.dd.note': { ru: 'разложить элементы по категориям тапом', en: 'sort items into categories by tapping' },
  'home.stats.streak': { ru: '{n} {days} подряд', en: '{n} {days} in a row' },
  'home.stats.total': { ru: 'пройдено вопросов', en: 'questions answered' },

  // ---- learn ----
  'learn.title': { ru: 'Учить', en: 'Learn' },
  'learn.warmup.title': { ru: 'Разминка', en: 'Warm-up' },
  'learn.warmup.note': { ru: '10 вопросов · с разбором после каждого', en: '10 questions · rationale after each one' },
  'learn.practice.title': { ru: 'Тренировка', en: 'Practice' },
  'learn.practice.note': { ru: '20 вопросов · с разбором после каждого', en: '20 questions · rationale after each one' },
  'learn.byDomain': { ru: 'По домену · 20 вопросов', en: 'By domain · 20 questions' },

  // ---- exam ----
  'exam.title': { ru: 'Экзамен', en: 'Exam' },
  'exam.lead': { ru: 'Пресеты сверху покрывают 90% случаев. Тонкая настройка — ниже, свёрнута.', en: 'The presets above cover 90% of cases. Fine-tuning is below, collapsed.' },
  'exam.preset.full.label': { ru: 'Как на экзамене', en: 'Like the real exam' },
  'exam.preset.full.note': { ru: '100 вопросов · 120 мин · вес по 6 доменам Cisco', en: '100 questions · 120 min · weighted across 6 Cisco domains' },
  'exam.preset.short.label': { ru: 'Короткий прогон', en: 'Short run' },
  'exam.preset.short.note': { ru: '30 вопросов · 35 мин', en: '30 questions · 35 min' },
  'exam.preset.weak.label': { ru: 'Только слабые домены', en: 'Weak domains only' },
  'exam.preset.weak.note': { ru: '40 вопросов · домены из статистики · без таймера', en: '40 questions · domains picked from your stats · no timer' },
  'exam.preset.manual.label': { ru: 'Своя настройка', en: 'Custom' },
  'exam.preset.manual.note': { ru: 'домены, типы, количество и таймер — вручную', en: 'domains, types, count and timer — set by hand' },
  'exam.manual.toggle': { ru: 'Настроить вручную', en: 'Custom setup' },
  'exam.manual.note': { ru: 'домены · типы вопросов · количество · таймер', en: 'domains · question types · count · timer' },
  'exam.manual.domains': { ru: 'Домены · пусто = все', en: 'Domains · empty = all' },
  'exam.manual.types': { ru: 'Тип вопросов · пусто = все', en: 'Question type · empty = all' },
  'exam.manual.count': { ru: 'Сколько вопросов', en: 'How many questions' },
  'exam.manual.time': { ru: 'Время', en: 'Time' },
  'exam.manual.noTimer': { ru: 'без таймера', en: 'no timer' },
  'exam.manual.min': { ru: '{n} мин', en: '{n} min' },
  'exam.qtype.txt': { ru: 'Текст', en: 'Text' },
  'exam.qtype.ex': { ru: 'Со схемой', en: 'With diagram' },
  'exam.qtype.dd': { ru: 'Сопоставление', en: 'Matching' },
  'exam.runSettings': { ru: 'На время экзамена', en: 'During the exam' },
  'exam.switch.keepAwake.label': { ru: 'Не гасить экран', en: "Keep screen on" },
  'exam.switch.keepAwake.note': { ru: 'пока идёт экзамен', en: 'while the exam is running' },
  'exam.switch.instant.label': { ru: 'Показывать ответ сразу', en: 'Show answer right away' },
  'exam.switch.instant.note': { ru: 'разбор после каждого вопроса', en: 'rationale after each question' },
  'exam.start': { ru: 'Начать · {n} вопросов', en: 'Start · {n} questions' },
  'exam.newExam.title': { ru: 'Начать новый экзамен?', en: 'Start a new exam?' },

  // ---- progress ----
  'progress.title': { ru: 'Прогресс', en: 'Progress' },
  'progress.mode.practice': { ru: 'Тренировка', en: 'Practice' },
  'progress.mode.srs': { ru: 'Повторение', en: 'Review' },
  'progress.today': { ru: 'Сегодня · {n} из {goal}', en: 'Today · {n} of {goal}' },
  'progress.today.answered': { ru: 'отвечено', en: 'answered' },
  'progress.today.wrong': { ru: '{n} {mistakes}', en: '{n} {mistakes}' },
  'progress.today.srs': { ru: 'работа над ошибками', en: 'mistake review' },
  'progress.activityDays': { ru: 'Активность за {n} дней', en: 'Activity over {n} days' },
  'progress.empty.body': { ru: 'Здесь появится график баллов, средняя скорость и темы, которые проседают.', en: 'This is where your score chart, average speed, and weak topics will show up.' },
  'progress.empty.hint': { ru: 'Пройди первый пробный экзамен — одной попытки уже хватит, чтобы увидеть расклад по доменам.', en: 'Take your first mock exam — one attempt is enough to see how you stand per domain.' },
  'progress.scoresFor': { ru: 'Баллы за {n} {attempts}', en: 'Scores over {n} {attempts}' },
  'progress.scores.empty': { ru: 'Появятся после «Как на экзамене» или «Короткий прогон» — это единственные режимы, взвешенные по блюпринту так же, как настоящий тест.', en: 'These appear after "Like the real exam" or "Short run" — the only modes weighted by the blueprint the way a real test is.' },
  'progress.scores.title': { ru: 'Баллы', en: 'Scores' },
  'progress.avgPerQuestion': { ru: 'средн. на вопрос', en: 'avg / question' },
  'progress.lastAttemptPct': { ru: 'в последней попытке', en: 'in the last attempt' },
  'progress.weakTopics': { ru: 'Слабые темы', en: 'Weak topics' },
  'progress.topic.correct': { ru: '{ok} из {tot} верно · {pct}%', en: '{ok} of {tot} correct · {pct}%' },
  'progress.topic.learn': { ru: 'Учить', en: 'Learn' },
  'progress.allAttempts': { ru: 'Все попытки', en: 'All attempts' },
  'progress.history.exam': { ru: 'Экзамен', en: 'Exam' },
  'progress.history.customExam': { ru: 'Свой экзамен', en: 'Custom exam' },
  'progress.history.practice': { ru: 'Тренировка', en: 'Practice' },
  'progress.history.notCounted': { ru: 'не засчитана · {ok}/{asked} верно из {total}', en: 'not counted · {ok}/{asked} correct out of {total}' },
  'progress.history.correctPerQuestion': { ru: '{ok}/{total} верно · {time} на вопрос', en: '{ok}/{total} correct · {time} / question' },
  'progress.backup.title': { ru: 'Резервная копия', en: 'Backup' },
  'progress.backup.body': { ru: 'Прогресс хранится только на этом телефоне. Сохрани копию перед переустановкой или сменой телефона — импорт вернёт всё как было, включая профиль и закладки.', en: "Progress lives only on this phone. Save a copy before reinstalling or switching phones — restoring brings everything back exactly as it was, profile and bookmarks included." },
  'progress.backup.export': { ru: 'Экспорт', en: 'Export' },
  'progress.backup.import': { ru: 'Импорт', en: 'Import' },
  'progress.restore.title': { ru: 'Восстановить резервную копию?', en: 'Restore this backup?' },
  'progress.restore.body': { ru: 'Текущий прогресс на телефоне будет заменён тем, что в файле.', en: "The progress currently on this phone will be replaced with what's in the file." },
  'progress.restore.ok': { ru: 'Восстановить', en: 'Restore' },

  // ---- sync card ----
  'sync.title': { ru: 'Синхронизация с сайтом', en: 'Sync with the website' },
  'sync.body': { ru: 'Один ключ на телефон и сайт: создай его здесь и введи на ccna.maks.top (Прогресс → Синхронизация) — после этого попытки, повторения и закладки будут сходиться сами. Ключ и есть доступ к прогрессу: храни его как пароль, аккаунта у сервера нет.', en: 'One key for phone and website: create it here and enter it at ccna.maks.top (Progress → Sync) — attempts, reviews and bookmarks will then reconcile on their own. The key is your access to that progress: keep it like a password, there is no account on the server.' },
  'sync.keyPlaceholder': { ru: 'ключ синхронизации', en: 'sync key' },
  'sync.action': { ru: 'Синхронизировать', en: 'Sync' },
  'sync.newKey': { ru: 'Создать ключ', en: 'Create a key' },
  'sync.neverSynced': { ru: 'Ещё ни разу не синхронизировано.', en: 'Never synced yet.' },
  'sync.syncedAt': { ru: 'Синхронизировано: {stamp}', en: 'Synced: {stamp}' },
  'sync.syncing': { ru: 'Синхронизирую…', en: 'Syncing…' },
  'sync.keyCreated': { ru: 'Ключ создан. Введи его на сайте: Прогресс → Синхронизация.', en: 'Key created. Enter it on the website: Progress → Sync.' },
  'sync.done': { ru: 'Готово. Попыток в истории: {n}', en: 'Done. Attempts in history: {n}' },
  'sync.upToDate': { ru: 'Всё уже совпадает.', en: 'Already up to date.' },
  'sync.err.key': { ru: 'Ключ не подходит: нужно 32–128 символов — латиница, цифры, «-» и «_».', en: 'Invalid key: it needs 32–128 characters — Latin letters, digits, "-" and "_".' },
  'sync.err.auth': { ru: 'Сервер не принял этот ключ.', en: 'The server rejected this key.' },
  'sync.err.closed': { ru: 'Сервер не заводит новые ключи. Введи тот, который уже используется на другом устройстве.', en: "The server isn't issuing new keys. Enter the one already used on another device." },
  'sync.err.shrink': { ru: 'Сервер отклонил запись: в ней меньше прогресса, чем уже сохранено. Ничего не потеряно — на сервере осталась прежняя версия.', en: 'The server rejected the write: it has less progress than what is already saved. Nothing is lost — the server kept the previous version.' },
  'sync.err.offline': { ru: 'Нет связи с сервером синхронизации.', en: "Can't reach the sync server." },
  'sync.err.server': { ru: 'Сервер ответил ошибкой. Попробуй позже — прогресс на месте.', en: 'The server returned an error. Try again later — your progress is intact.' },
  'sync.err.corrupt': { ru: 'На сервере лежит что-то нечитаемое. Синхронизация остановлена, чтобы не затереть прогресс.', en: "There's something unreadable on the server. Sync was stopped so it wouldn't overwrite your progress." },
  'sync.err.conflict': { ru: 'Второе устройство пишет прямо сейчас. Попробуй ещё раз.', en: 'Another device is writing right now. Try again.' },

  // ---- backup.js ----
  'backup.shareTitle': { ru: 'CCNA Trainer — резервная копия', en: 'CCNA Trainer — backup' },
  'backup.copied': { ru: 'Скопировано — вставь в заметки или письмо себе', en: 'Copied — paste it into a note or an email to yourself' },
  'backup.copyFailed': { ru: 'Не удалось сохранить копию. Попробуй ещё раз.', en: "Couldn't save the backup. Try again." },
  'backup.badFile': { ru: 'Файл повреждён или это не резервная копия.', en: "The file is damaged or isn't a backup." },
  'backup.readFailed': { ru: 'Не удалось прочитать файл.', en: "Couldn't read the file." },
  'backup.notABackup': { ru: 'Файл не похож на резервную копию CCNA Trainer.', en: "The file doesn't look like a CCNA Trainer backup." },

  // ---- profile ----
  'profile.header': { ru: 'Профиль', en: 'Profile' },
  'profile.plan.title': { ru: 'План обучения', en: 'Study plan' },
  'profile.examDate': { ru: 'Дата экзамена', en: 'Exam date' },
  'profile.clearDate': { ru: 'Убрать дату', en: 'Clear date' },
  'profile.examDate.hint': { ru: 'Управляет обратным отсчётом на главной. На подбор вопросов не влияет.', en: "Controls the countdown on Home. Doesn't affect which questions are picked." },
  'profile.dailyGoal': { ru: 'Норма в день', en: 'Daily quota' },
  'profile.dailyGoal.hint': { ru: 'Это «План на сегодня» на главной. Приложение не ограничивает — можно решать больше.', en: 'This is "Today\'s plan" on Home. The app doesn\'t cap you — you can always do more.' },
  'profile.notify': { ru: 'Напоминания', en: 'Reminders' },
  'profile.notify.enabled.label': { ru: 'Напоминания', en: 'Reminders' },
  'profile.notify.enabled.note': { ru: 'локальные, приходят с телефона', en: 'local, sent from the phone itself' },
  'profile.notify.daily.label': { ru: 'Дневная норма', en: 'Daily quota' },
  'profile.notify.daily.note': { ru: 'если к вечеру норма не закрыта', en: "if the quota isn't met by evening" },
  'profile.notify.weeklyMock.label': { ru: 'Пробный экзамен раз в неделю', en: 'Mock exam once a week' },
  'profile.notify.weeklyMock.note': { ru: 'когда с прошлого прошло 7 дней', en: 'when 7 days have passed since the last one' },
  'profile.notify.timeHint': { ru: 'Время, в которое приходят оба напоминания. Всё считается на телефоне — интернет не нужен.', en: 'The time both reminders fire. Everything is computed on the phone — no internet needed.' },
  'profile.notify.denied': { ru: 'Android не разрешил уведомления этому приложению. Включи их в настройках телефона, потом вернись сюда.', en: "Android didn't allow notifications for this app. Turn them on in the phone's settings, then come back here." },
  'profile.notify.unsupported': { ru: 'В браузере напоминания не приходят — они работают только в приложении на телефоне.', en: "Reminders don't fire in the browser — they only work in the phone app." },
  'profile.level': { ru: 'С чего начинаешь', en: 'Starting point' },
  'profile.level.hint': { ru: 'Идёт в промпт для ИИ: «Я {level}». Больше ни на что не влияет.', en: 'Goes into the AI prompt: "I {level}". Nothing else depends on it.' },
  'profile.level.fallback': { ru: 'готовлюсь к экзамену', en: 'am preparing for the exam' },
  'profile.language': { ru: 'Язык', en: 'Language' },
  'profile.language.ru': { ru: 'Русский', en: 'Russian' },
  'profile.language.en': { ru: 'English', en: 'English' },
  'profile.language.hint': { ru: 'Меняет язык приложения сразу, без перезапуска. Вопросы банка на английском в обоих случаях.', en: 'Switches the app language instantly, no restart. Bank questions stay in English either way.' },
  'profile.plan.noDate': { ru: '{perDay}, даты экзамена нет — обратного отсчёта на главной не будет.', en: "{perDay}, no exam date set — there won't be a countdown on Home." },
  'profile.plan.passed': { ru: 'Дата экзамена прошла, {n} {days} назад — обнови её ниже, если пересдаёшь, или убери. Норма — {perDay}.', en: 'The exam date has passed, {n} {days} ago — update it below if you are retaking, or clear it. Quota: {perDay}.' },
  'profile.plan.today': { ru: 'Экзамен сегодня. Норма — {perDay}.', en: "The exam is today. Quota: {perDay}." },
  'profile.plan.farOut': { ru: '{days}, норма — {perDay}.', en: '{days}, quota: {perDay}.' },
  'profile.plan.total': { ru: '{days} по {goal} {perQ} в день — это {total} {qs} до даты.', en: '{days} at {goal} {perQ} a day — that\'s {total} {qs} before the date.' },
  'profile.plan.daysUntil': { ru: '{n} {days} до экзамена', en: '{n} {days} until the exam' },
  'profile.plan.perDay': { ru: '{n} {questions} в день', en: '{n} {questions} a day' },

  // ---- question screen ----
  'question.close': { ru: 'Закрыть', en: 'Close' },
  'question.grid': { ru: 'Список вопросов', en: 'Question list' },
  'question.chooseN': { ru: 'выбери {n}', en: 'choose {n}' },
  'question.disputed': { ru: 'спорный ключ', en: 'disputed key' },
  'question.showOutput': { ru: 'Показать вывод команды ({n} стр.)', en: 'Show command output ({n} lines)' },
  'question.bookmark.on': { ru: '★ Отложен', en: '★ Bookmarked' },
  'question.bookmark.off': { ru: '☆ Отложить', en: '☆ Bookmark' },
  'question.fontSize': { ru: 'Aa Размер', en: 'Aa Size' },
  'question.swipeHint': { ru: 'свайп → далее', en: 'swipe → next' },
  'question.tag.yours': { ru: '✓ твой', en: '✓ yours' },
  'question.tag.missed': { ru: 'пропущен', en: 'missed' },
  'question.tag.wrongYours': { ru: '✗ твой', en: '✗ yours' },
  'question.exhibitAlt': { ru: 'Схема к вопросу {n}', en: 'Diagram for question {n}' },
  'question.answer': { ru: 'Ответить', en: 'Check' },
  'question.finish': { ru: 'Завершить', en: 'Finish' },
  'question.next': { ru: 'Дальше', en: 'Next' },
  'question.nextArrow': { ru: 'Следующий →', en: 'Next →' },
  'question.rationale': { ru: 'Разбор', en: 'Rationale' },
  'question.reset': { ru: 'Сброс', en: 'Reset' },
  'question.check': { ru: 'Проверить', en: 'Check' },
  'question.matchSelected': { ru: '{item} выбран — выбери категорию', en: '{item} selected — pick a category' },
  'question.matchCancel': { ru: 'Отменить', en: 'Cancel' },
  'question.matchPlaced': { ru: 'Разложено {filled} из {needed}', en: 'Placed {filled} of {needed}' },
  'question.placedShort': { ru: '{filled} из {needed}', en: '{filled} of {needed}' },
  'question.matchExtra': { ru: '{n} {items} лишних', en: '{n} extra {items}' },
  'question.matchExtraOne': { ru: 'один элемент лишний', en: 'one item is extra' },
  'question.unfinishedGap': { ru: 'Остались вопросы без ответа', en: 'Some questions are unanswered' },
  'question.unfinishedBody': { ru: 'Пропущено: {left} из {total}. Без ответа они засчитаются как неверные.', en: 'Skipped: {left} of {total}. Left unanswered, they count as wrong.' },
  'question.gotoGap': { ru: 'К вопросу {n}', en: 'Go to question {n}' },
  'question.finishAnyway': { ru: 'Всё равно завершить', en: 'Finish anyway' },
  'question.leaveExam.title': { ru: 'Выйти из экзамена?', en: 'Leave the exam?' },
  'question.leaveExam.body': { ru: 'Прогресс сохранится — вернуться можно с главной.', en: 'Your progress is saved — you can come back from Home.' },
  'question.leaveExam.ok': { ru: 'Выйти', en: 'Leave' },
  'question.leaveExam.cancel': { ru: 'Остаться', en: 'Stay' },
  'question.grid.title': { ru: 'Вопросы · отвечено {n} из {total}', en: 'Questions · answered {n} of {total}' },
  'question.review.verdict.ok': { ru: 'Верно', en: 'Correct' },
  'question.review.verdict.bad': { ru: 'Неверно', en: 'Incorrect' },
  'question.review.aiButton': { ru: 'Разобрать с ИИ', en: 'Ask an AI' },
  'question.review.theoryChapter': { ru: 'Теория: {title}', en: 'Theory: {title}' },
  'question.review.theorySection': { ru: 'Раздел: {title}', en: 'Section: {title}' },

  // ---- qmarkup ----
  'qmarkup.extraItem': { ru: 'лишний элемент попал в категорию — ему место в банке', en: 'an extra item ended up in a category — it belongs in the pool' },
  'qmarkup.extraItems': { ru: 'лишние элементы попали в категории — им место в банке', en: 'extra items ended up in categories — they belong in the pool' },
  'qmarkup.placedRight': { ru: 'разложено верно {right} из {needed}', en: 'placed correctly {right} of {needed}' },
  'qmarkup.correctAnswer': { ru: 'правильный ответ {keys}', en: 'correct answer {keys}' },
  'qmarkup.extraNotPlaced': { ru: 'Лишние элементы, которым не место ни в одной категории: {items}', en: "Extra items that don't belong in any category: {items}" },
  'qmarkup.why': { ru: 'Почему {key}', en: 'Why {key}' },
  'qmarkup.whyNot': { ru: 'Почему не {key}', en: 'Why not {key}' },
  'qmarkup.whyMissing': { ru: 'Пояснение для этого варианта пока не готово.', en: "There's no explanation for this option yet." },
  'qmarkup.expMissing': { ru: 'Подробное пояснение пока не готово для этого вопроса.', en: "There's no detailed explanation for this question yet." },
  'qmarkup.disputed': { ru: 'Спорный ключ — сверь по схеме.', en: 'Disputed key — check it against the diagram.' },

  // ---- exhibit.js ----
  'exhibit.hint': { ru: 'двойной тап — приблизить · щипок — точнее', en: 'double-tap to zoom · pinch for precision' },

  // ---- match.js ----
  'match.hint': { ru: 'Тапни элемент, затем категорию. Тянуть ничего не нужно.', en: "Tap an item, then a category. Nothing to drag." },
  'match.freeSlot': { ru: '{n} {slots} свободно', en: '{n} {slots} free' },
  'match.tapToPlace': { ru: 'тапни, чтобы положить', en: 'tap to place' },
  'match.removeAria': { ru: 'Убрать', en: 'Remove' },

  // ---- result ----
  'result.mode.practice': { ru: 'Тренировка', en: 'Practice' },
  'result.mode.srs': { ru: 'Повторение', en: 'Review' },
  'result.doneHeader': { ru: 'Готово', en: 'Done' },
  'result.shortOfThreshold': { ru: 'не хватило {n} {points} до порога {threshold}', en: '{n} {points} short of the {threshold} pass mark' },
  'result.exactThreshold': { ru: 'ровно порог {threshold}', en: 'exactly at the {threshold} pass mark' },
  'result.aboveThreshold': { ru: 'запас {n} {points} над порогом {threshold}', en: '{n} {points} above the {threshold} pass mark' },
  'result.correct': { ru: 'верно', en: 'correct' },
  'result.minPerQuestion': { ru: 'мин / вопрос', en: 'min / question' },
  'result.vsLast': { ru: 'к прошлой', en: 'vs. last' },
  'result.notCounted': { ru: 'Не засчитана · отвечено {n} из {total}', en: 'Not counted · answered {n} of {total}' },
  'result.customExam': { ru: 'Свой экзамен', en: 'Custom exam' },
  'result.practice': { ru: 'Тренировка', en: 'Practice' },
  'result.accuracy': { ru: 'точность', en: 'accuracy' },
  'result.nextStep': { ru: 'Что делать дальше', en: 'What to do next' },
  'result.weakest': { ru: 'Слабее всего {domains}.', en: 'Weakest: {domains}.' },
  'result.evenAcrossDomains': { ru: 'По доменам ровно — добирай объёмом.', en: 'Even across domains — build volume from here.' },
  'result.mistakesLine': { ru: '{n} {mistakes} в этой попытке. {detail}', en: '{n} {mistakes} in this attempt. {detail}' },
  'result.noMistakes': { ru: 'Ни одной ошибки — бери следующий домен или подними объём.', en: 'No mistakes at all — move to the next domain or raise the volume.' },
  'result.reviewMistakes': { ru: 'Работа над ошибками · {n}', en: 'Review mistakes · {n}' },
  'result.byDomain': { ru: 'По доменам', en: 'By domain' },
  'result.reviewAll': { ru: 'Разбор всех {n}', en: 'Review all {n}' },
  'result.mistakesToAi': { ru: 'Ошибки в ИИ', en: 'Ask AI about mistakes' },

  // ---- review ----
  'review.filter.bad': { ru: 'Ошибки', en: 'Mistakes' },
  'review.filter.all': { ru: 'Все', en: 'All' },
  'review.filter.ok': { ru: 'Верно', en: 'Correct' },
  'review.header': { ru: 'Разбор', en: 'Review' },
  'review.verdict.ok': { ru: 'верно', en: 'correct' },
  'review.verdict.bad': { ru: 'ошибка', en: 'wrong' },
  'review.noMistakes': { ru: 'Ошибок нет — можно выдохнуть.', en: 'No mistakes — you can relax.' },
  'review.empty': { ru: 'Здесь пусто.', en: 'Nothing here.' },
  'review.showMore': { ru: 'Показать ещё {n}', en: 'Show {n} more' },

  // ---- theory (chapter list) ----
  'theoryList.title': { ru: 'Теория', en: 'Theory' },
  'theoryList.loading': { ru: 'Загружаю учебник…', en: 'Loading the textbook…' },
  'theoryList.rowMeta': { ru: '{minutes} мин · {n} вопр.', en: '{minutes} min · {n} q.' },
  'theoryList.coverageTitle': { ru: 'Покрыто вопросов банка', en: 'Bank questions covered' },
  'theoryList.coverageFoot': { ru: '{done} из {total} вопросов · прочитано {read} из {chapters} глав', en: '{done} of {total} questions · read {read} of {chapters} chapters' },
  'theoryList.resume': { ru: 'Продолжить', en: 'Continue' },
  'theoryList.searchPlaceholder': { ru: 'Поиск по темам', en: 'Search topics' },
  'theoryList.empty': { ru: 'Ничего не нашлось. Попробуй другое слово.', en: 'Nothing found. Try a different word.' },
  'theoryList.loadFailed': { ru: 'Учебник не загрузился: {message}. Проверь, что перед сборкой отработал <code>npm run sync-data</code>.', en: "The textbook didn't load: {message}. Make sure <code>npm run sync-data</code> ran before the build." },

  // ---- topic (theory reader) ----
  'topic.header': { ru: 'Теория', en: 'Theory' },
  'topic.textSize': { ru: 'Размер текста', en: 'Text size' },
  'topic.read': { ru: 'Прочитано', en: 'Read' },
  'topic.readDone': { ru: '✓ Прочитано', en: '✓ Read' },
  'topic.questionsN': { ru: 'Вопросы · {n}', en: 'Questions · {n}' },
  'topic.markedRead': { ru: 'Глава отмечена прочитанной', en: 'Chapter marked as read' },
  'topic.markedUnread': { ru: 'Отметка снята', en: 'Mark removed' },
  'topic.loading': { ru: 'Загружаю главу…', en: 'Loading the chapter…' },
  'topic.loadFailed': { ru: 'Глава не открылась: {message}', en: "Couldn't open the chapter: {message}" },
  'topic.examBadge': { ru: 'экзамен {list}', en: 'exam {list}' },
  'topic.meta': { ru: '{minutes} мин · {n} вопросов банка по теме', en: "{minutes} min · {n} bank questions on this topic" },
  'topic.toc': { ru: 'Содержание · {n}', en: 'Contents · {n}' },
  'topic.nextChapter': { ru: 'Следующая глава', en: 'Next chapter' },

  // ---- ai-prompt ----
  'ai.header': { ru: 'Разобрать с ИИ', en: 'Ask an AI' },
  'ai.shareTitle': { ru: 'Разобрать с ИИ', en: 'Ask an AI' },
  'ai.sendSchemaText': { ru: 'Отправить: схема + текст', en: 'Send: diagram + text' },
  'ai.copyAndOpen': { ru: 'Скопировать и открыть {target}', en: 'Copy and open {target}' },
  'ai.copyOnly': { ru: 'Только скопировать', en: 'Copy only' },
  'ai.allDomainMistakes': { ru: 'Все ошибки домена', en: 'All mistakes in this domain' },
  'ai.copied': { ru: 'Скопировано', en: 'Copied' },
  'ai.copyFailed': { ru: 'Не удалось скопировать', en: "Couldn't copy" },
  'ai.copiedOpening': { ru: 'Скопировано · открываю {target}', en: 'Copied · opening {target}' },
  'ai.copiedPasteInChat': { ru: 'Скопировано — вставьте в чат', en: 'Copied — paste it into the chat' },
  'ai.shareFailed': { ru: 'Не удалось поделиться', en: "Couldn't share" },
  'ai.attachedStrip': { ru: 'Схема уйдёт картинкой вместе с текстом — приложение выберешь в окне «Поделиться»', en: 'The diagram goes as an image along with the text — pick the app in the share sheet' },
  'ai.imageOnlyLabel': { ru: 'Схема только картинкой · {n}', en: 'Diagram-only · {n}' },
  'ai.imageOnlyLead': { ru: 'Эти схемы описать текстом нечем — отправь их по одной, каждая уйдёт картинкой со своим вопросом.', en: "These diagrams have no text description — send them one at a time, each as an image with its own question." },
  'ai.questionN': { ru: 'Вопрос {n}', en: 'Question {n}' },
  'ai.whereToOpen': { ru: 'Куда открывать', en: 'Where to open' },
  'ai.leadSingle': { ru: 'Промпт собирается на устройстве и работает без интернета.', en: 'The prompt is built on the device and works without internet.' },
  'ai.leadMulti': { ru: 'В промпт войдут {n} вопросов, на которые ты ответил неправильно. Схемы уходят текстовым описанием{exception}.', en: "The prompt will include {n} questions you answered incorrectly. Diagrams go as a text description{exception}." },
  'ai.leadMultiException': { ru: ', кроме перечисленных ниже', en: ', except the ones listed below' },
  'ai.include': { ru: 'Что включить', en: 'What to include' },

  // ---- notify.js ----
  'notify.daily.title': { ru: 'Норма на сегодня', en: "Today's quota" },
  'notify.daily.body': { ru: '{n} {questions} — а сделано {done}. Успеешь?', en: "{n} {questions} — you've done {done} so far. Can you make it?" },
  'notify.mock.title': { ru: 'Пробный экзамен', en: 'Mock exam' },
  'notify.mock.bodyLast': { ru: 'С прошлого прошло {n} дн. Проверь, где стоишь.', en: "It's been {n} days since the last one. Check where you stand." },
  'notify.mock.bodyNever': { ru: 'Ты ещё не проходил пробный — одна попытка покажет расклад по доменам.', en: "You haven't taken a mock exam yet — a single attempt shows where you stand per domain." },
};

export default STRINGS;
