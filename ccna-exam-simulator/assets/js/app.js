/* CCNA 200-301 Exam Simulator — engine
   Data: data/questions.json (+ data/meta.json), exhibits under images/exhibits/ */
'use strict';

const $ = s => document.querySelector(s);
const app = () => document.getElementById('trainer');
const esc = s => { const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; };
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0;[a[i], a[j]] = [a[j], a[i]]; } return a; };
const ASSET_V = '11';                        // bump when exhibits are regenerated (cache-bust)
const IMG = n => `images/exhibits/q${n}.jpg?v=${ASSET_V}`;
const DATA_V = '9';                        // bump whenever questions.json/meta.json content changes —
                                              // the host (Cloudflare/Pages) caches these for 10 min otherwise
let DATA = [], META = null, DOM = {};      // DOM: id -> {name,weight}
let POOL = [];                             // scorable (txt/ex, + dd that are ready)
let S = {};                                // active session state
let BY_N = null;                           // question number -> question, built on first use

// The progress store is an ES module (assets/js/store.js) — it has to be, it imports the
// rules shared with the Android app — and this file is a classic script, so the two meet
// on `window`. Every call goes through this handle rather than a bare global: with modules
// or storage unavailable (an old browser, a file:// open) the trainer still runs, it just
// forgets what happened.
const P = () => window.Store || null;
const byN = () => BY_N || (BY_N = new Map(DATA.map(q => [q.n, q])));

// ============================ BRAND ============================
// The NetPath mark: the same three bars as brand/generate.py, on the same 86-unit grid,
// kept as data rather than a pasted <svg> string. It used to live in landing.js and moved
// here when the landing was removed — the sidebar lockup is the only place it is drawn now.
const BARS = [[8, 58, 20, 20, 7], [33, 38, 20, 40, 7], [58, 12, 20, 66, 7]];
const MARK_INK = ['#16181D', '#16181D', '#C9A24A'];
const mark = size =>
  `<svg width="${size}" height="${size}" viewBox="0 0 86 86" aria-hidden="true">` +
  BARS.map(([x, y, w, h, r], i) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${MARK_INK[i]}"/>`).join('') +
  '</svg>';

const BRAND = 'NetPath';

// ============================ I18N ============================
// UI-chrome translation. Default stays Russian — EN is an opt-in toggle (the pill in the
// sidebar), persisted in localStorage. The question text and options themselves (`t`/`o`)
// stay Russian-only by design — translating the bank itself is out of scope. The bank's
// own explanations (`why`/`exp`) do have English fields (`why_en`/`exp_en`) added
// separately from the bank build, with a per-key fallback to the Russian original for
// anything not yet translated — see rationale() below.
//
// Stored choice first, then what the browser asks for, then Russian. There is no server to
// read Accept-Language from — the site is static — so navigator.languages is the
// client-side equivalent of the same header. This used to be resolved in landing.js.
function initialLang() {
  let saved = null;
  try { saved = localStorage.getItem('ccna_lang'); } catch { /* blocked storage */ }
  if (saved === 'ru' || saved === 'en') return saved;
  const asked = navigator.languages && navigator.languages.length
    ? navigator.languages : [navigator.language || ''];
  return asked.some(l => /^en\b/i.test(l)) ? 'en' : 'ru';
}
let LANG = initialLang();

// Redraws the screen in place rather than reloading: a reload costs the scroll position
// and, mid-attempt, would drop the session. <html lang> follows, because it has to name
// the language of the text actually on screen — otherwise Chrome offers to translate a
// page already in the reader's language and a screen reader picks the wrong phonemes.
function setLang(lang) {
  if ((lang !== 'ru' && lang !== 'en') || lang === LANG) return;
  LANG = lang;
  try { localStorage.setItem('ccna_lang', lang); } catch { /* blocked storage */ }
  document.documentElement.lang = lang;
  const y = window.scrollY;
  renderSide();
  if (SCREEN) SCREEN();
  window.scrollTo(0, y);
}

// How to redraw whatever is on screen after a language change. Every screen entry point
// records itself here; each one renders from state it does not own, so replaying it is safe.
let SCREEN = null;
const I18N = {
  ru: {
    boot_loading: 'Загрузка банка вопросов…',
    home_stats: '{0} оцениваемых вопросов · {1} со схемами · {2} с пояснениями',
    home_go_start: 'Старт',
    home_go_config: 'Настроить',
    home_full_title: 'Полный экзамен',
    home_full_desc: '100 вопросов · 120 мин · взвешено по 6 доменам Cisco · порог 825/1000 · отчёт по доменам',
    home_custom_title: 'Свой экзамен',
    home_custom_desc: 'выбрать домены · число вопросов · таймер · разбор в конце',
    home_practice_title: 'Тренировка',
    home_practice_desc: 'вопрос за вопросом · мгновенная проверка · пояснения',
    home_domains_title: 'Домены экзамена',
    home_domain_weight: 'вес {0}% · {1} вопр.',
    home_dd_note: 'Drag-and-drop интерактивно: <b>{0}/{1}</b> готово. Лаб-симуляции ({2}) вынесены отдельно — ',
    home_sims_link: 'открыть справочно',
    home_footer: 'CCNA 200-301 Exam Simulator · банк 1401 вопрос · офлайн, без бэкенда',
    sim_guide_header: 'Инструкции лаб-интерфейса',
    sim_tasks_header: 'Задачи',
    sim_no_answer: 'Ответ отсутствует в исходном дампе.',
    sim_page_title: 'Лаб-симуляции',
    sim_page_desc: '{0} интерактивных лаб-заданий из дампа. Это hands-on симуляции Cisco (настройка на виртуальных устройствах) — офлайн в тренажёре не выполняются и не оцениваются. Ниже приведён текст задания и, где есть топология в дампе, схема. Проверенное решение — под тоглом «Показать ответ».',
    badge_sim: 'ЛАБ',
    sim_offline_short: 'Лаб-симуляция · офлайн не выполняется',
    sim_offline_note: 'Лаб-симуляция · офлайн не выполняется и не оценивается',
    sim_show_answer: 'Показать ответ',
    type_txt: 'Текст',
    type_ex: 'Со схемой',
    type_dd: 'Drag & Drop',
    type_sim: 'Симуляция',
    nav_back: '← назад',
    nav_home: '← домой',
    nav_prev: '← пред',
    nav_next: 'след →',
    nav_finish: 'завершить',
    nav_exit: '✕ выход',
    label_custom_exam: 'Свой экзамен',
    label_practice: 'Тренировка',
    cfg_domains_label: 'Домены (пусто = все)',
    cfg_types_label: 'Тип вопросов (пусто = все, включая Drag & Drop',
    cfg_types_sim_note: '; симуляции — справочно, без оценки',
    cfg_count_label: 'Сколько вопросов',
    all_option: 'все',
    cfg_shuffle: 'перемешать',
    cfg_jump_label: 'Или сразу к вопросу по номеру (фильтры выше игнорируются)',
    cfg_jump_placeholder: 'Введите любой номер вопроса: 1 – {0}',
    cfg_time_label: 'Время (минут)',
    cfg_no_timer: 'без таймера',
    cfg_matching: 'Под фильтры подходит {0} вопр.',
    cfg_matching_none: 'Под выбранные фильтры не подходит ни один вопрос',
    type_sim_note: 'не оцениваются, только читаются',
    cfg_start_exam: 'Старт →',
    cfg_start_practice: 'Начать →',
    practice_no_question: 'Вопроса {0} нет в банке',
    q_label: 'Вопрос {0}',
    badge_exhibit: 'СХЕМА',
    badge_choose: 'выбери {0}',
    badge_disputed: 'спорный ключ',
    cli_show: 'Показать конфигурацию / вывод команды ({0} стр.)',
    exp_show: 'показать пояснение ({0} предл.)',
    key_label: 'Ключ: {0}',
    key_inline: ' · ключ: {0}',
    disputed_note: 'Спорный ключ — сверь по схеме.',
    no_explanation_yet: 'Подробное пояснение пока не готово для этого вопроса.',
    tag_correct: '✓ верно',
    tag_incorrect: '✗ неверно',
    your_choice: ' · твой выбор',
    missed: ' · пропущен',
    ai_q_label: 'Вопрос {0} [{1}]',
    ai_disputed: ' (спорный ключ)',
    ai_exhibit_note: '[к вопросу приложена схема/скриншот — картинка не входит в этот текст]',
    ai_dd_type: 'Тип: Drag & Drop',
    ai_dd_items: 'Элементы: {0}',
    ai_dd_placement: 'Мой вариант распределения:',
    ai_correct_answer: 'Правильный ответ: {0}',
    ai_my_answer: 'Мой ответ: {0}',
    ai_mistakes_header: 'Ниже {0} вопрос(ов) CCNA 200-301, на которые я ответил неправильно. Разбери каждый: почему мой ответ неверный и почему верный вариант правильный.\n\n',
    copied_label: '✓ скопировано',
    copy_failed: 'Не удалось скопировать в буфер обмена.',
    copy_for_ai: '📋 Скопировать для ИИ',
    copy_for_ai_short: '📋 для ИИ',
    copy_mistakes: '📋 Скопировать ошибки для ИИ',
    practice_review_btn: '📋 Разбор ошибок',
    jump_title: 'Перейти к вопросу по номеру',
    not_found_short: 'нет',
    verdict_correct: '✓ Верно',
    verdict_incorrect: '✗ Неверно',
    no_questions_filtered: 'Нет вопросов под выбранные фильтры.',
    finish_confirm: 'Завершить экзамен?',
    // Leaving a run now pauses it instead of losing it, so the only thing left worth
    // warning about is the clock — it is a deadline, and it does not stop with you.
    pause_timed: 'Прогон сохранится, но часы продолжат идти. Выйти?',
    resume_label: 'Незавершённый прогон',
    resume_exam: 'Экзамен',
    resume_practice: 'Тренировка',
    resume_srs: 'Повторение',
    resume_at: 'вопрос {0} из {1}',
    resume_answered: 'отвечено {0}',
    resume_left: 'осталось {0}',
    resume_expired: 'время вышло',
    resume_go: 'Продолжить',
    resume_finish: 'Завершить',
    resume_finish_confirm: 'Завершить прогон и записать результат в историю?',
    resume_replace: 'Есть незавершённый прогон. Начать новый? Незавершённый будет потерян — он не попадёт в историю.',
    back_to_run: '← Вернуться к прогону · вопрос {0} из {1}',
    flag_on: '★ снять метку',
    flag_off: '☆ на потом',
    nav_finish_exam: 'Завершить',
    grid_answered: 'отвечено',
    grid_flagged: 'на потом',
    grid_unanswered: 'не отвечено',
    dd_elements: 'Элементы',
    dd_categories: 'Категории',
    dd_check: 'Проверить',
    dd_placed: 'Разложено {0} из {1}',
    dd_extra: 'лишних элементов: {0}',
    practice_results_title: 'Итоги тренировки',
    answered_pct: '{0} из {1} отвечено верно ({2}%)',
    continue_practice: 'Продолжить тренировку',
    review_title: 'Разбор',
    filter_errors: 'Ошибки',
    filter_all: 'Все',
    filter_correct: 'Верно',
    no_errors: 'Ошибок нет — можно выдохнуть 🎉',
    no_questions: 'Нет вопросов.',
    no_correct: 'Верных ответов нет.',
    dd_no_why: 'Для вопросов на сопоставление пояснений в банке нет — здесь только правильное распределение.',
    results_kicker: 'Результат',
    results_abandoned: 'Отвечено меньше трети вопросов: попытка не идёт ни в баллы, ни в статистику. Верные ответы засчитаны.',
    results_of: '/ 1000',
    results_title: 'Результат',
    scale_note: 'шкала 300–1000 · порог 825',
    correct_pct: '{0} из {1} верно ({2}%)',
    pass_badge: '✓ проходной уровень',
    fail_badge: '✗ ниже проходного',
    another_exam: 'Ещё полный экзамен',
    by_domain: 'По доменам',
    badge_ok: 'верно',
    badge_wrong: 'ошибка',
    learn_title: 'Учить',
    learn_open: 'Учить',
    learn_today: 'Сегодня',
    learn_goal_line: 'Дневная норма · {0} из {1}',
    learn_goal_set: 'Норма в день',
    learn_today_line: 'Отвечено {0} · ошибок {1} · повторений {2}',
    learn_streak: 'Серия: {0} дн.',
    learn_streak_none: 'Серии пока нет — ответь хотя бы на один вопрос сегодня.',
    learn_srs: 'Повторение',
    learn_srs_note: 'Вопросы, у которых подошёл срок. Верный ответ отодвигает следующий показ (1 → 3 → 7 → 16 → 35 дней), неверный возвращает вопрос на завтра.',
    learn_srs_go: 'Повторить · {0}',
    learn_srs_empty: 'Всё повторено.',
    learn_srs_next: 'Следующее повторение: {0}.',
    learn_srs_none: 'Пока нечего повторять — вопросы попадают сюда после первого ответа.',
    learn_wrong: 'Работа над ошибками',
    learn_wrong_note: 'Вопросы, где последний ответ был неверным. Самые свежие ошибки — первыми.',
    learn_wrong_go: 'Разобрать · {0}',
    learn_wrong_empty: 'Неразобранных ошибок нет.',
    learn_topics: 'Слабые темы',
    learn_topics_note: 'Считается по ответам в сохранённых попытках. История живёт 6 месяцев, поэтому старое постепенно перестаёт учитываться.',
    learn_topics_empty: 'Пока не по чему судить — пройди экзамен или тренировку.',
    learn_topic_row: '{0} из {1} верно · {2}%',
    learn_topic_go: 'учить',
    learn_days: 'Последние 14 дней',
    hist_home_title: 'Мой прогресс',
    hist_title: 'История попыток',
    hist_none: 'Пока нет ни одной завершённой попытки. Пройди экзамен или тренировку — результат сохранится здесь, в этом браузере.',
    hist_all: 'Вся история · {0}',
    hist_open: 'разбор',
    hist_delete: 'удалить',
    hist_delete_confirm: 'Удалить эту попытку из истории?',
    hist_mode_exam: 'Экзамен',
    hist_mode_practice: 'Тренировка',
    hist_unscored: 'без шкалы',
    hist_not_counted: 'не засчитана',
    hist_abandoned: 'брошена · отвечено {0} из {1}',
    hist_minutes: '{0} мин',
    hist_replay_note: 'Сохранённая попытка · {0}',
    hist_open_screen: 'Прогресс и синхронизация',
    book_title: 'Учебник',
    book_sub: 'Те же 47 глав, что в Android-приложении: теория под каждую тему блюпринта, а в конце главы — вопросы банка по ней. Отметка «прочитано» синхронизируется вместе с прогрессом.',
    book_loading: 'Загружаю учебник…',
    book_failed: 'Учебник не загрузился: {0}.',
    book_retry: 'Попробовать снова',
    book_cov: 'Покрыто вопросов банка',
    book_cov_foot: '{0} из {1} вопросов стоят за прочитанными главами · прочитано {2} из {3} глав.',
    book_resume: 'Продолжить · {0}',
    book_search: 'Поиск по темам',
    book_nothing: 'Ничего не нашлось. Попробуй другое слово.',
    book_row_meta: '{0} мин · {1} вопр.',
    book_blueprint: 'экзамен {0}',
    book_toc: 'Содержание · {0}',
    book_read_mark: 'Прочитано',
    book_read_done: '✓ Прочитано',
    book_practice: 'Вопросы по главе · {0}',
    book_next: 'Следующая глава · {0}',
    book_back: '← к оглавлению',
    book_open: 'Учебник',
    book_open_for_q: 'Глава: {0}',
    book_open_at: 'Раздел: {0}',
    hist_mode_srs: 'Повторение',
    hist_group_exams: 'Экзамены',
    hist_group_practice: 'Тренировки',
    hist_mistakes: 'Ошибок: {0}',
    hist_no_mistakes: 'Без ошибок',
    hist_fix: 'Разобрать ошибки',
    hist_retention: 'История живёт полгода: попытка старше 6 месяцев удаляется сама — и здесь, и на сервере. Слабые темы считаются по тому, что осталось.',
    sync_title: 'Синхронизация с телефоном',
    sync_note: 'Один ключ на оба устройства: создай его здесь и введи в Android-приложении — после этого прогресс будет сходиться сам. Ключ и есть доступ к прогрессу: храни его как пароль, аккаунта и пароля у сервера нет.',
    sync_key_ph: 'ключ синхронизации',
    sync_new: 'Создать ключ',
    sync_copy: 'Скопировать',
    sync_copied: 'Ключ скопирован — введи его на телефоне.',
    sync_created: 'Ключ создан. Введи его в приложении: Прогресс → Синхронизация.',
    sync_go: 'Синхронизировать',
    sync_forget: 'Забыть ключ',
    sync_forget_confirm: 'Забыть ключ на этом устройстве? Прогресс останется здесь, но перестанет сходиться с телефоном.',
    sync_never: 'Ещё ни разу не синхронизировано.',
    sync_last: 'Синхронизировано: {0}',
    sync_running: 'Синхронизирую…',
    sync_done: 'Готово. Попыток в истории: {0}',
    sync_nochange: 'Всё уже совпадает. Попыток в истории: {0}',
    sync_err_key: 'Ключ не подходит: нужно 32–128 символов — латиница, цифры, «-» и «_».',
    sync_err_auth: 'Сервер не принял этот ключ.',
    sync_err_closed: 'Сервер не заводит новые ключи. Введи тот, который уже используется на другом устройстве.',
    sync_err_shrink: 'Сервер отклонил запись: в ней меньше прогресса, чем уже сохранено. Ничего не потеряно — на сервере осталась прежняя версия.',
    sync_err_offline: 'Нет связи с сервером синхронизации.',
    sync_err_server: 'Сервер ответил ошибкой. Попробуй позже — прогресс на месте.',
    sync_err_corrupt: 'На сервере лежит что-то нечитаемое. Синхронизация остановлена, чтобы не затереть прогресс.',
    sync_err_conflict: 'Второе устройство пишет прямо сейчас. Попробуй ещё раз.',
    hist_export: 'Выгрузить прогресс',
    hist_import: 'Загрузить из файла',
    hist_transfer_note: 'Прогресс хранится в этом браузере. Файл выгрузки — тот же формат, что читает и пишет Android-приложение: выгрузи здесь, открой на телефоне (Прогресс → Резервная копия) — и наоборот.',
    hist_import_replace: 'Импорт заменит весь прогресс в этом браузере: {0} попыток. Продолжить?',
    hist_import_bad: 'Файл не похож на резервную копию CCNA Trainer.',
    hist_imported: 'Прогресс загружен: попыток — {0}.',

    // ---- the dashboard, the sidebar, and the weak-spots screen ----
    nav_dashboard: 'Дашборд',
    nav_weak: 'Слабые места',
    nav_book: 'Учебник',
    nav_history: 'История',
    nav_progress: 'Прогресс',
    side_offline: 'офлайн · без бэкенда',
    ready_title: 'Прогноз готовности',
    ready_scale: 'шкала 300–1000 · порог 825 · по последним {0} ответам',
    ready_delta: '{0} за неделю',
    ready_to_pass: 'до порога {0}',
    ready_weak_now: 'Слабое сейчас',
    ready_empty: 'Пока не по чему судить — пройди экзамен или тренировку.',
    weak_title: 'Слабые места',
    weak_go: 'Тренировать слабое',
    weak_mix: '{0} · {1} · с пояснениями',
    weak_mix_title: 'Микс на сегодня',
    weak_mix_rule: 'Доля домена в миксе — его вес по блюпринту, умноженный на долю ошибок за последние {0} ответов.',
    weak_mix_none: 'Ни один домен не ниже порога 75% — тренировать по слабому нечего.',
    weak_doms_title: 'Домены ниже порога',
    weak_dom_cost: 'Вес {0}% в экзамене · {1} из {2} · это {3} прогноза',
    weak_dom_go: 'Учить · {0} вопр.',
    dash_modes_title: 'Режимы',
    dash_domains_title: 'Домены экзамена · последние {0} ответов',
    dash_domain_foot: '{0} из {1} верно · вес {2}%',
    dash_domain_go: 'учить',
    dash_weak_link: 'Слабые места →',
    dash_srs_line: 'подошёл срок у {0}',
    dash_wrong_line: 'последний ответ был неверным',
    dash_scores_title: 'Баллы за {0}',
    dash_scores_note: 'Только взвешенные по блюпринту попытки — тренировка и повторение не попадают на шкалу.',
    dash_today_line: 'Отвечено {0} · ошибок {1} · повторений {2} · серия {3} дн.',
    plan_title: 'План подготовки',
    plan_exam_date: 'Дата экзамена',
    plan_days_left: 'осталось {0} дн.',
    plan_days_none: 'дата экзамена не задана',
    plan_days_past: 'дата экзамена уже прошла',
    plan_mock_in: 'Пробный экзамен через {0} дн.',
    plan_mock_due: 'Пора на пробный экзамен',
    plan_side_title: 'До экзамена',
    plan_side_unit: 'дн.',
    plan_side_set: 'Задать дату экзамена →',
    backup_title: 'Резервная копия',
    hist_book_ch: 'глава',
  },
  en: {
    boot_loading: 'Loading the question bank…',
    home_stats: '{0} scored questions · {1} with exhibits · {2} with rationale',
    home_go_start: 'Start',
    home_go_config: 'Configure',
    home_full_title: 'Full Exam',
    home_full_desc: '100 questions · 120 min · weighted across 6 Cisco domains · pass 825/1000 · per-domain report',
    home_custom_title: 'Custom Exam',
    home_custom_desc: 'pick domains · question count · timer · review at the end',
    home_practice_title: 'Practice',
    home_practice_desc: 'one question at a time · instant feedback · explanations',
    home_domains_title: 'Exam Domains',
    home_domain_weight: 'weight {0}% · {1} q.',
    home_dd_note: 'Drag-and-drop interactive: <b>{0}/{1}</b> ready. Lab simulations ({2}) are listed separately — ',
    home_sims_link: 'open for reference',
    home_footer: 'CCNA 200-301 Exam Simulator · 1401-question bank · offline, no backend',
    sim_guide_header: 'Lab UI Instructions',
    sim_tasks_header: 'Tasks',
    sim_no_answer: 'No answer available in the source dump.',
    sim_page_title: 'Lab Simulations',
    sim_page_desc: '{0} interactive lab items from the dump. These are hands-on Cisco simulations (configuring virtual devices) — not runnable or scored offline in the trainer. Below is the task text and, where the dump has a topology, the exhibit. The verified solution is under the "Show answer" toggle.',
    badge_sim: 'LAB',
    sim_offline_short: 'Lab simulation · not runnable offline',
    sim_offline_note: 'Lab simulation · not runnable or scored offline',
    sim_show_answer: 'Show answer',
    type_txt: 'Text',
    type_ex: 'With exhibit',
    type_dd: 'Drag & Drop',
    type_sim: 'Simulation',
    nav_back: '← back',
    nav_home: '← home',
    nav_prev: '← prev',
    nav_next: 'next →',
    nav_finish: 'finish',
    nav_exit: '✕ exit',
    label_custom_exam: 'Custom Exam',
    label_practice: 'Practice',
    cfg_domains_label: 'Domains (empty = all)',
    cfg_types_label: 'Question type (empty = all, including Drag & Drop',
    cfg_types_sim_note: '; simulations are reference-only, not scored',
    cfg_count_label: 'How many questions',
    all_option: 'all',
    cfg_shuffle: 'shuffle',
    cfg_jump_label: 'Or jump straight to a question number (filters above are ignored)',
    cfg_jump_placeholder: 'Enter any question number: 1 – {0}',
    cfg_time_label: 'Time (minutes)',
    cfg_no_timer: 'no timer',
    cfg_matching: '{0} questions match these filters',
    cfg_matching_none: 'No question matches the selected filters',
    type_sim_note: 'reference only, not scored',
    cfg_start_exam: 'Start →',
    cfg_start_practice: 'Begin →',
    practice_no_question: 'Question {0} is not in the bank',
    q_label: 'Question {0}',
    badge_exhibit: 'EXHIBIT',
    badge_choose: 'choose {0}',
    badge_disputed: 'disputed key',
    cli_show: 'Show configuration / command output ({0} lines)',
    exp_show: 'show explanation ({0} sentences)',
    key_label: 'Key: {0}',
    key_inline: ' · key: {0}',
    disputed_note: 'Disputed key — check against the exhibit.',
    no_explanation_yet: 'A detailed explanation isn’t ready for this question yet.',
    tag_correct: '✓ correct',
    tag_incorrect: '✗ incorrect',
    your_choice: ' · your pick',
    missed: ' · missed',
    ai_q_label: 'Question {0} [{1}]',
    ai_disputed: ' (disputed key)',
    ai_exhibit_note: '[this question has an exhibit/screenshot — the image isn’t included in this text]',
    ai_dd_type: 'Type: Drag & Drop',
    ai_dd_items: 'Items: {0}',
    ai_dd_placement: 'My placement:',
    ai_correct_answer: 'Correct answer: {0}',
    ai_my_answer: 'My answer: {0}',
    ai_mistakes_header: 'Below are {0} CCNA 200-301 question(s) I answered incorrectly. Go through each one: why my answer is wrong and why the correct option is right.\n\n',
    copied_label: '✓ copied',
    copy_failed: 'Could not copy to clipboard.',
    copy_for_ai: '📋 Copy for AI',
    copy_for_ai_short: '📋 for AI',
    copy_mistakes: '📋 Copy mistakes for AI',
    practice_review_btn: '📋 Review mistakes',
    jump_title: 'Jump to a question by number',
    not_found_short: 'n/a',
    verdict_correct: '✓ Correct',
    verdict_incorrect: '✗ Incorrect',
    no_questions_filtered: 'No questions match the selected filters.',
    finish_confirm: 'Finish the exam?',
    pause_timed: 'The run will be kept, but the clock keeps running. Leave?',
    resume_label: 'Unfinished run',
    resume_exam: 'Exam',
    resume_practice: 'Practice',
    resume_srs: 'Repetition',
    resume_at: 'question {0} of {1}',
    resume_answered: '{0} answered',
    resume_left: '{0} left',
    resume_expired: 'time is up',
    resume_go: 'Resume',
    resume_finish: 'Finish',
    resume_finish_confirm: 'Finish this run and file the result in the history?',
    resume_replace: 'A run is still unfinished. Start a new one? The unfinished run is lost — it will not reach the history.',
    back_to_run: '← Back to the run · question {0} of {1}',
    flag_on: '★ unflag',
    flag_off: '☆ flag for later',
    nav_finish_exam: 'Finish',
    grid_answered: 'answered',
    grid_flagged: 'for later',
    grid_unanswered: 'unanswered',
    dd_elements: 'Items',
    dd_categories: 'Categories',
    dd_check: 'Check',
    dd_placed: 'Placed {0} of {1}',
    dd_extra: 'extra items: {0}',
    practice_results_title: 'Practice Results',
    answered_pct: '{0} of {1} answered correctly ({2}%)',
    continue_practice: 'Continue practice',
    review_title: 'Review',
    filter_errors: 'Errors',
    filter_all: 'All',
    filter_correct: 'Correct',
    no_errors: 'No errors — nice work 🎉',
    no_questions: 'No questions.',
    no_correct: 'No correct answers.',
    dd_no_why: 'The bank carries no rationale for matching questions — this is the correct placement, nothing more.',
    results_kicker: 'Result',
    results_abandoned: 'Fewer than a third of the questions were answered: this run counts neither towards the score nor in the statistics. The correct answers still count.',
    results_of: '/ 1000',
    results_title: 'Result',
    scale_note: 'scale 300–1000 · pass 825',
    correct_pct: '{0} of {1} correct ({2}%)',
    pass_badge: '✓ passing score',
    fail_badge: '✗ below passing',
    another_exam: 'Another full exam',
    by_domain: 'By Domain',
    badge_ok: 'correct',
    badge_wrong: 'wrong',
    learn_title: 'Practice',
    learn_open: 'Practice',
    learn_today: 'Today',
    learn_goal_line: 'Daily goal · {0} of {1}',
    learn_goal_set: 'Answers per day',
    learn_today_line: '{0} answered · {1} wrong · {2} repetitions',
    learn_streak: 'Streak: {0} days',
    learn_streak_none: 'No streak yet — answer one question today to start one.',
    learn_srs: 'Repetition',
    learn_srs_note: 'Questions that have come due. A right answer pushes the next showing out (1 → 3 → 7 → 16 → 35 days), a wrong one brings it back tomorrow.',
    learn_srs_go: 'Repeat · {0}',
    learn_srs_empty: 'Everything is repeated.',
    learn_srs_next: 'Next repetition: {0}.',
    learn_srs_none: 'Nothing to repeat yet — a question lands here after its first answer.',
    learn_wrong: 'Mistakes',
    learn_wrong_note: 'Questions whose last answer was wrong, most recently missed first.',
    learn_wrong_go: 'Work through · {0}',
    learn_wrong_empty: 'No outstanding mistakes.',
    learn_topics: 'Weak topics',
    learn_topics_note: 'Counted from the answers in saved attempts. History is kept for six months, so old work gradually stops counting.',
    learn_topics_empty: 'Nothing to judge by yet — take an exam or a practice run.',
    learn_topic_row: '{0} of {1} right · {2}%',
    learn_topic_go: 'study',
    learn_days: 'Last 14 days',
    hist_home_title: 'My progress',
    hist_title: 'Attempt history',
    hist_none: 'No finished attempts yet. Take an exam or a practice run — the result is kept here, in this browser.',
    hist_all: 'Full history · {0}',
    hist_open: 'review',
    hist_delete: 'delete',
    hist_delete_confirm: 'Delete this attempt from the history?',
    hist_mode_exam: 'Exam',
    hist_mode_practice: 'Practice',
    hist_unscored: 'unscored',
    hist_not_counted: 'not counted',
    hist_abandoned: 'abandoned · {0} of {1} answered',
    hist_minutes: '{0} min',
    hist_replay_note: 'Saved attempt · {0}',
    hist_open_screen: 'Progress and sync',
    book_title: 'Textbook',
    book_sub: 'The same 47 chapters as in the Android app: theory for every blueprint topic, and the bank\'s questions on it at the end of each chapter. The "read" mark syncs along with the rest of the progress.',
    book_loading: 'Loading the textbook…',
    book_failed: 'The textbook did not load: {0}.',
    book_retry: 'Try again',
    book_cov: 'Bank questions covered',
    book_cov_foot: '{0} of {1} questions are backed by a chapter you have read · {2} of {3} chapters read.',
    book_resume: 'Continue · {0}',
    book_search: 'Search the chapters',
    book_nothing: 'Nothing found. Try another word.',
    book_row_meta: '{0} min · {1} questions',
    book_blueprint: 'exam {0}',
    book_toc: 'Contents · {0}',
    book_read_mark: 'Mark as read',
    book_read_done: '✓ Read',
    book_practice: 'Questions on this chapter · {0}',
    book_next: 'Next chapter · {0}',
    book_back: '← contents',
    book_open: 'Textbook',
    book_open_for_q: 'Chapter: {0}',
    book_open_at: 'Section: {0}',
    hist_mode_srs: 'Repetition',
    hist_group_exams: 'Exams',
    hist_group_practice: 'Practice',
    hist_mistakes: 'Wrong: {0}',
    hist_no_mistakes: 'No mistakes',
    hist_fix: 'Work through the mistakes',
    hist_retention: 'History lives six months: an attempt older than that is dropped by itself, here and on the server. Weak topics are counted from what is left.',
    sync_title: 'Sync with the phone',
    sync_note: 'One key on both devices: make it here, type it into the Android app, and progress keeps itself together from then on. The key is the access: keep it like a password — the server has no accounts and no passwords.',
    sync_key_ph: 'sync key',
    sync_new: 'Make a key',
    sync_copy: 'Copy',
    sync_copied: 'Key copied — type it into the phone.',
    sync_created: 'Key created. Enter it in the app: Progress → Sync.',
    sync_go: 'Sync now',
    sync_forget: 'Forget the key',
    sync_forget_confirm: 'Forget the key on this device? Progress stays here but stops meeting the phone.',
    sync_never: 'Never synced yet.',
    sync_last: 'Synced: {0}',
    sync_running: 'Syncing…',
    sync_done: 'Done. Attempts in history: {0}',
    sync_nochange: 'Already in step. Attempts in history: {0}',
    sync_err_key: 'That key will not do: 32–128 characters, letters, digits, "-" and "_".',
    sync_err_auth: 'The server did not accept this key.',
    sync_err_closed: 'This server is not taking new keys. Use the one the other device already has.',
    sync_err_shrink: 'The server refused this write: it holds less progress than what is already stored. Nothing was lost — the earlier version is still there.',
    sync_err_offline: 'No connection to the sync server.',
    sync_err_server: 'The server answered with an error. Try later — the progress is safe.',
    sync_err_corrupt: 'What is stored on the server cannot be read. Sync stopped rather than overwrite progress.',
    sync_err_conflict: 'The other device is writing right now. Try again.',
    hist_export: 'Export progress',
    hist_import: 'Import from a file',
    hist_transfer_note: 'Progress lives in this browser. The export file is the format the Android app reads and writes: export here, open it on the phone (Progress → Backup) — and the other way round.',
    hist_import_replace: 'Importing replaces all progress in this browser: {0} attempts. Continue?',
    hist_import_bad: 'That file is not a CCNA Trainer backup.',
    hist_imported: 'Progress imported: {0} attempts.',

    // ---- the dashboard, the sidebar, and the weak-spots screen ----
    nav_dashboard: 'Dashboard',
    nav_weak: 'Weak spots',
    nav_book: 'Textbook',
    nav_history: 'History',
    nav_progress: 'Progress',
    side_offline: 'offline · no backend',
    ready_title: 'Readiness forecast',
    ready_scale: 'scale 300–1000 · pass 825 · over the last {0} answers',
    ready_delta: '{0} this week',
    ready_to_pass: '{0} short of passing',
    ready_weak_now: 'Weak right now',
    ready_empty: 'Nothing to judge by yet — take an exam or a practice run.',
    weak_title: 'Weak spots',
    weak_go: 'Work on the weak spots',
    weak_mix: '{0} · {1} · with explanations',
    weak_mix_title: 'Today\u2019s mix',
    weak_mix_rule: 'A domain\u2019s share of the mix is its blueprint weight times how much of it went wrong over the last {0} answers.',
    weak_mix_none: 'No domain is below the 75% threshold — there is no weak spot to drill.',
    weak_doms_title: 'Domains below the threshold',
    weak_dom_cost: 'Weight {0}% of the exam · {1} out of {2} · that is {3} of the forecast',
    weak_dom_go: 'Study · {0} q.',
    dash_modes_title: 'Modes',
    dash_domains_title: 'Exam domains · last {0} answers',
    dash_domain_foot: '{0} of {1} right · weight {2}%',
    dash_domain_go: 'study',
    dash_weak_link: 'Weak spots →',
    dash_srs_line: '{0} have come due',
    dash_wrong_line: 'the last answer was wrong',
    dash_scores_title: 'Scores over {0}',
    dash_scores_note: 'Blueprint-weighted attempts only — practice and repetition never reach the scale.',
    dash_today_line: '{0} answered · {1} wrong · {2} repetitions · {3}-day streak',
    plan_title: 'Study plan',
    plan_exam_date: 'Exam date',
    plan_days_left: '{0} days left',
    plan_days_none: 'no exam date set',
    plan_days_past: 'the exam date has passed',
    plan_mock_in: 'Mock exam in {0} days',
    plan_mock_due: 'Time for a mock exam',
    plan_side_title: 'To the exam',
    plan_side_unit: 'days',
    plan_side_set: 'Set the exam date →',
    backup_title: 'Backup',
    hist_book_ch: 'chapter',
  },
};
const fmt = (s, ...vals) => s.replace(/\{(\d+)\}/g, (_, i) => vals[i] ?? '');

// "21 баллов" is what a template produces and nobody says. Russian picks one of three
// forms by the last digits; English by whether the number is one. Only the handful of
// counted nouns that actually appear in full — abbreviations like "вопр." and "дн." are
// invariant and never come through here.
const RU_PLURAL = {
  question: ['вопрос', 'вопроса', 'вопросов'],
  mistake: ['ошибка', 'ошибки', 'ошибок'],
  point: ['балл', 'балла', 'баллов'],
  attempt: ['попытка', 'попытки', 'попыток'],
  day: ['день', 'дня', 'дней'],
};
const EN_PLURAL = {
  question: ['question', 'questions'], mistake: ['mistake', 'mistakes'],
  point: ['point', 'points'], attempt: ['attempt', 'attempts'], day: ['day', 'days'],
};
function plural(n, kind) {
  const abs = Math.abs(n) % 100, ones = abs % 10;
  if (LANG === 'en') return EN_PLURAL[kind][Math.abs(n) === 1 ? 0 : 1];
  if (abs > 10 && abs < 20) return RU_PLURAL[kind][2];
  return RU_PLURAL[kind][ones === 1 ? 0 : ones >= 2 && ones <= 4 ? 1 : 2];
}
// "{0} {1:question}" — the number, then the noun made to agree with it.
const n_ = (n, kind) => `${n} ${plural(n, kind)}`;
const t = (k, ...vals) => fmt((I18N[LANG] && I18N[LANG][k]) || I18N.ru[k] || k, ...vals);
document.documentElement.lang = LANG;

// ---- load ----
async function boot() {
  const [q, m] = await Promise.all([
    fetch(`data/questions.json?v=${DATA_V}`).then(r => r.json()),
    fetch(`data/meta.json?v=${DATA_V}`).then(r => r.json()),
  ]);
  DATA = q; META = m;
  META.domains.forEach(d => DOM[d.id] = d);
  POOL = DATA.filter(scorable);
  // The sidebar counts chapters read out of how many there are, and only the index knows
  // the second number. 40 KB behind a 3 MB bank, and the strip redraws when it lands —
  // a deployment without a textbook simply keeps showing the count without a total.
  bookLoadIndex().then(renderSide).catch(() => {});
}
function scorable(q) {
  if (q.y === 'txt' || q.y === 'ex') return q.a && q.a.length > 0;
  if (q.y === 'dd') return !!q.dd;          // only reconstructed drag-drops are scorable
  return false;
}
const domName = id => (DOM[id] ? DOM[id].name : id);
const domShort = id => domName(id).replace(/^\d+\.\d+\s+/, '');

// ============================ ENTRY ============================
// The root of the site is the dashboard, and the dashboard is built on the bank — it
// counts the questions and forecasts a score off them — so the 3 MB fetch starts on load
// rather than on entering a mode. Until it lands every screen paints `boot_loading`.
//
// A deep link (?mode=…) opens that screen directly; the sidebar rewrites the parameter as
// it goes, so any screen can be copied out of the address bar and come back the same.
let booting = null;
const ensureBooted = () => booting || (booting = boot());

const MODE_ENTRY = {
  home,                         // the dashboard, and the default with no parameter at all
  weak: weakScreen,
  book: bookScreen,
  history: historyScreen,
  progress: progressScreen,
  exam: startFullExam,          // straight into the weighted 100-question attempt
  custom: () => cfg('exam'),    // the configure screen for a self-built exam
  practice: () => cfg('practice'),
};

function route() {
  const mode = new URLSearchParams(location.search).get('mode');
  openMode(MODE_ENTRY[mode] ? mode : 'home');
}

function openMode(mode) {
  const go = MODE_ENTRY[mode] || home;
  NAV_AT = mode;
  narrow();
  renderSide();
  app().innerHTML = `<h1>CCNA 200-301</h1><div class="sub">${t('boot_loading')}</div>`;
  ensureBooted().then(() => { go(); renderSide(); });
}

// The dashboard is laid out in two columns and gets a wider column to do it in. Every way
// out of it passes through one of the calls to narrow() below, so no other screen inherits
// the width — a question at 1180px is a line too long to read.
const narrow = () => app().classList.remove('wide');

// ============================ SIDEBAR ============================
// One strip of navigation that outlives every screen. It is redrawn rather than mutated:
// each item carries a count that comes out of the store, and those move as work is done.
//
// Which item is lit is held here and not read back off the address bar — an attempt
// started from the dashboard keeps the dashboard lit, which is where leaving it lands.
let NAV_AT = 'home';

const NAV = [
  ['home', 'nav_dashboard'],
  ['weak', 'nav_weak'],
  ['book', 'nav_book'],
  ['history', 'nav_history'],
  ['progress', 'nav_progress'],
];

// The textbook index is 40 KB against a 3 MB bank, and the sidebar wants its chapter count
// on every screen. Fetched once, in the background, and the strip is redrawn when it lands.
const navCounts = () => {
  const st = P();
  if (!st) return {};
  const read = Object.keys(st.readMap(st.book)).length;
  return {
    weak: DATA.length ? String(weakMixPlan().length || '') : '',
    book: bookIndex ? `${read}/${bookIndex.topics.length}` : (read ? String(read) : ''),
    history: st.attempts.length ? String(st.attempts.length) : '',
    progress: '',
  };
};

// Where the countdown card gets its two numbers: the exam, and the weekly mock. Both are
// the phone's rules, out of shared/plan.js and shared/localdate.js.
function planState(now = Date.now()) {
  const st = P();
  if (!st) return null;
  const mock = st.mockState(st.attempts, now);
  return {
    left: st.daysUntil(st.profile.examDate, now),
    date: st.profile.examDate || null,
    mock,
    // How far through this week's mock cycle we are — the bar under the countdown.
    pct: Math.round(((st.MOCK_EVERY_DAYS - mock.daysLeft) / st.MOCK_EVERY_DAYS) * 100),
  };
}

const mockLine = plan =>
  plan.mock.due ? t('plan_mock_due') : t('plan_mock_in', plan.mock.daysLeft);

function sidePlanHTML() {
  const plan = planState();
  if (!plan) return '';
  const dated = plan.date && plan.left !== null && plan.left >= 0;
  return `<div class="plan-card">
    <div class="lb">${t('plan_side_title')}</div>
    ${dated ? `<div class="plan-days">
      <b>${plan.left}</b><span class="u">${t('plan_side_unit')}</span>
      <span class="dt">${esc(stampDay(plan.date))}</span>
    </div>` : `<button class="plan-set" data-nav="progress">${t('plan_side_set')}</button>`}
    <div class="plan-track"><i style="width:${Math.max(0, Math.min(100, plan.pct))}%"></i></div>
    <div class="plan-note">${mockLine(plan)}</div>
  </div>`;
}

function renderSide() {
  const box = document.getElementById('side');
  if (!box) return;
  const counts = navCounts();
  box.innerHTML = `
    <div class="side-lockup">${mark(26)}<span>${BRAND}</span></div>
    <nav class="side-nav" aria-label="${BRAND}">
      ${NAV.map(([id, key]) => `<button class="snav${id === NAV_AT ? ' on' : ''}" data-nav="${id}"
        ${id === NAV_AT ? 'aria-current="page"' : ''}>
        <span class="dot"></span><span class="lb">${t(key)}</span>
        <span class="n">${esc(counts[id] || '')}</span></button>`).join('')}
    </nav>
    <div class="side-foot">
      ${sidePlanHTML()}
      <div class="side-lang">
        <div class="lang-switch" role="group" aria-label="Language / Язык">
          ${['ru', 'en'].map(l => `<span class="lang-opt${l === LANG ? ' on' : ''}"
            data-lang="${l}">${l.toUpperCase()}</span>`).join('')}
        </div>
        <span class="note">${t('side_offline')}</span>
      </div>
    </div>`;
  box.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => goScreen(b.dataset.nav));
  box.querySelectorAll('[data-lang]').forEach(b => b.onclick = () => setLang(b.dataset.lang));
}

// Leaving a running exam through the sidebar is the same decision as leaving it through
// the ✕ in its own strip, so both come through here. Neither files anything and neither
// throws anything away: the run is written down and offered back on the dashboard. Only
// a timed exam asks first, because its deadline does not pause with it.
function goScreen(id) {
  const go = MODE_ENTRY[id];
  if (!go) return;
  if (!confirmLeave()) return;
  pauseRun();
  if (S.tid) { clearInterval(S.tid); S.tid = null; }
  S = {};
  NAV_AT = id;
  narrow();
  history.replaceState(null, '', id === 'home' ? location.pathname : `?mode=${id}`);
  renderSide();
  if (!DATA.length) return ensureBooted().then(() => { go(); renderSide(); });
  go();
  renderSide();
}

// ============================ READINESS ============================
// The forecast the dashboard is built on, and the mix the one big button starts. Both are
// derived, never stored: shared/readiness.js reads the last 200 answers out of the attempt
// history, and the Android app forecasts off exactly the same function.
//
// Recomputed per render rather than cached. It walks 200 answers over a Map — cheap enough
// that a cache would only be a way of showing a stale number after an attempt is filed.
const WEAK_BELOW = 75;              // shared/progress.js calls the same line "weak"
const MIX_SIZE = 20;                // one sitting, not a second exam
const WEEK_MS = 7 * 86_400_000;

const readyNow = () => {
  const st = P();
  if (!st || !DATA.length) return null;
  return st.readiness(st.attempts, byN(), META.domains, isCorrect);
};

const readyDelta = () => {
  const st = P();
  if (!st || !DATA.length) return null;
  return st.readinessDelta(st.attempts, byN(), META.domains, isCorrect, Date.now() - WEEK_MS);
};

// "1.0 Network Fundamentals" — the blueprint number is set apart from the name.
const domNameHTML = id => {
  const m = domName(id).match(/^(\d+\.\d+)\s+(.*)$/);
  return m ? `<span class="dn">${esc(m[1])}</span> ${esc(m[2])}` : esc(domName(id));
};

// The six domains as the window actually saw them. A domain nobody has answered anything
// in has no percentage — it is left out rather than drawn at zero, which would read as
// "you got them all wrong" instead of "nothing to say yet".
function domainRows(r) {
  if (!r) return [];
  return META.domains.map(d => {
    const p = r.perDomain[d.id] || { ok: 0, tot: 0, pct: null };
    return { id: d.id, weight: d.weight, ok: p.ok, tot: p.tot, pct: p.pct };
  }).filter(x => x.tot > 0);
}

// How today's mix is split. Each weak domain's share is its blueprint weight times how
// much of it went wrong — a domain worth a quarter of the exam and half missed is worth
// twice one worth an eighth and half missed. Everything below the threshold gets at least
// one question: a mix that silently drops a domain is not the mix the line above it says.
function weakMixPlan() {
  const rows = domainRows(readyNow()).filter(d => d.pct < WEAK_BELOW);
  if (!rows.length) return [];
  const raw = rows.map(d => ({ ...d, w: d.weight * (1 - d.pct / 100) }));
  const sum = raw.reduce((a, d) => a + d.w, 0) || 1;
  let left = MIX_SIZE;
  return raw.map((d, i) => {
    const rest = raw.length - i - 1;                  // the one question each of those still owes
    // The last domain takes the remainder, so the parts always add up to MIX_SIZE.
    const want = rest === 0 ? left : Math.round((d.w / sum) * MIX_SIZE);
    const n = Math.min(Math.max(1, want), Math.max(1, left - rest));
    left -= n;
    return { ...d, mix: n };
  });
}

// The mix as question numbers. Inside a domain the weak topics come first — they are the
// part of it that is actually costing points — and the order within each group is random,
// which a stable sort over a shuffled pool gives for free.
function weakMixNumbers(plan = weakMixPlan()) {
  if (!plan.length) return [];
  const st = P();
  const hot = new Set((st ? st.weakTopics(st.attempts, byN(), isCorrect, { limit: 12 }) : [])
    .map(r => r.topic));
  const out = [];
  for (const d of plan) {
    const pool = shuffle(POOL.filter(q => q.dom === d.id));
    pool.sort((a, b) => (hot.has(b.tp) ? 1 : 0) - (hot.has(a.tp) ? 1 : 0));
    out.push(...pool.slice(0, d.mix).map(q => q.n));
  }
  return shuffle(out);
}

// "20 вопросов · IPC 9 · SEC 6 · IPS 5 · с пояснениями"
const mixLine = plan => t('weak_mix',
  n_(plan.reduce((a, d) => a + d.mix, 0), 'question'),
  plan.map(d => `${d.id} ${d.mix}`).join(' · '));

// Every run started from a weak spot is practice: instant checking and the rationale, and
// never the 300..1000 scale — a pick aimed at what you are worst at is not the sample the
// scale describes. Same rule as startCustomExam.
const startWeakRun = () => startRun(weakMixNumbers());

function startDomainRun(id) {
  const plan = weakMixPlan().find(d => d.id === id);
  const n = plan ? plan.mix : MIX_SIZE;
  startRun(shuffle(POOL.filter(q => q.dom === id)).slice(0, n).map(q => q.n));
}

// A question from a domain (or a topic), so the chapter link has something to resolve
// against — bookChapterFor maps a question, not a subject. For a domain the pick is not
// arbitrary: it comes from the weakest topic inside it, which is the chapter actually
// worth opening, and only falls back to the first question when nothing is flagged yet.
//
// A topic pick is narrowed to the topic's own domain first. `tp` is the source dump's own
// tag and is frequently wrong (see CLAUDE.md); a question tagged "OSPF" that this project
// classified into Automation would otherwise hand the OSPF row a chapter about SDN.
// A handful rather than one: a topic or a domain is not a question, and the chapter it
// belongs in is settled by a vote among its questions (see bookChapterFor). Taking the
// first match instead put the BGP row in the chapter on routing tables, because that is
// where question #2 happens to live.
const someQOf = (pick, limit = 25) => {
  const out = [];
  for (const q of POOL) { if (pick(q)) { out.push(q.n); if (out.length >= limit) break; } }
  return out;
};

function domainChapterQs(id) {
  const st = P();
  const weak = st ? st.weakTopics(st.attempts, byN(), isCorrect, { limit: 12 }) : [];
  const hit = weak.find(r => r.dom === id);
  const inTopic = hit ? someQOf(q => q.dom === id && q.tp === hit.topic) : [];
  return inTopic.length ? inTopic : someQOf(q => q.dom === id);
}
const chapterSlot = qns => qns && qns.length ? `<span data-forq="${qns.join(',')}"></span>` : '';

// ============================ DASHBOARD ============================
// Where am I, and what should I do right now — in that order, and above the fold.
function home() {
  SCREEN = home;
  NAV_AT = 'home';
  const st = P();
  const ex = DATA.filter(q => q.y === 'ex').length;
  const r = readyNow();
  const plan = weakMixPlan();
  app().innerHTML = `
  <div>
    <h1 class="home">CCNA 200-301</h1>
    <div class="sub">${t('home_stats', POOL.length, ex, META.with_exp)}</div>
  </div>

  ${resumeCardHTML()}

  <div class="dgrid">
    ${readyPanelHTML(r, plan)}
    <div class="dcol">${todayCardHTML()}${queueRowsHTML()}</div>
  </div>

  <div class="dgrid top">
    <div class="modes">
      <h2>${t('dash_modes_title')}</h2>
      <button class="btn big" onclick="startFullExam()">
        <span class="tx"><b>${t('home_full_title')}</b><span>${t('home_full_desc')}</span></span>
        <span class="go">${t('home_go_start')}</span>
      </button>
      <button class="btn big pu" onclick="cfg('exam')">
        <span class="tx"><b>${t('home_custom_title')}</b><span>${t('home_custom_desc')}</span></span>
        <span class="go">${t('home_go_config')}</span>
      </button>
      <button class="btn big gr" onclick="cfg('practice')">
        <span class="tx"><b>${t('home_practice_title')}</b><span>${t('home_practice_desc')}</span></span>
        <span class="go">${t('home_go_config')}</span>
      </button>
    </div>
    ${scoreChartHTML()}
  </div>

  ${domainsSectionHTML(r)}

  <div class="sub">${t('home_dd_note', META.dd_ready, META.dd_total, META.sim_total)}<a class="link" href="#" onclick="browseSims();return false;">${t('home_sims_link')}</a>.</div>
  <div class="foot">${t('home_footer')}</div>`;
  app().classList.add('wide');
  wireDash();
  if (st) window.scrollTo(0, 0);
}

// A run that was left unfinished, offered back. First thing on the dashboard when there is
// one, because the reader who reloaded the tab or wandered into the textbook is looking for
// exactly this and has no other way back to it.
//
// Two buttons and no third: come back to it, or finish it and let it into the history. It
// is dropped only by starting another run, which asks first.
function resumeCardHTML() {
  const sn = pausedSession();
  if (!sn) return '';
  const parts = [t('resume_at', Math.min((sn.i || 0) + 1, sn.qs.length), sn.qs.length)];
  const answered = sessionAnswered(sn);
  if (answered) parts.push(t('resume_answered', answered));
  if (sn.endsAt) {
    const left = sn.endsAt - Date.now();
    parts.push(left > 0 ? t('resume_left', t('hist_minutes', Math.ceil(left / 60000))) : t('resume_expired'));
  }
  return `<div class="card resume">
    <div class="lb">${t('resume_label')}</div>
    <div class="rs-t">${t(SESSION_KIND[sn.mode] || 'resume_practice')} · ${esc(parts.join(' · '))}</div>
    <div class="rs-b">
      <button class="btn primary" data-act="resume">${t('resume_go')}</button>
      <button class="btn" data-act="resume-finish">${t('resume_finish')}</button>
    </div>
  </div>`;
}

// The forecast, what is dragging it, and the button that acts on it — one dark panel,
// because the number on it is the only one worth reading before booking an exam.
// The panel always ends in the run worth doing next, and there are only two answers: work
// on what is weak, or — with nothing under the threshold, or nothing measured yet — sit a
// full exam, which is what would move the forecast either way.
const readyActionHTML = plan => plan.length
  ? `<button class="weakgo" data-act="weak-run">
      <span class="tx"><b>${t('weak_go')}</b><span>${esc(mixLine(plan))}</span></span>
      <span class="go">${t('home_go_start')}</span></button>`
  : `<button class="weakgo" onclick="startFullExam()">
      <span class="tx"><b>${t('home_full_title')}</b><span>${t('home_full_desc')}</span></span>
      <span class="go">${t('home_go_start')}</span></button>`;

function readyPanelHTML(r, plan) {
  const pass = passMark();
  const has = r && r.forecast !== null;
  if (!has) {
    return `<div class="ready">
      <div class="ready-l"><div class="kick">${t('ready_title')}</div>
        <div class="ready-empty">${t('ready_empty')}</div></div>
      ${readyActionHTML([])}
    </div>`;
  }
  const d = readyDelta();
  const short = pass - r.forecast;
  const weak = domainRows(r).filter(x => x.pct < WEAK_BELOW).sort((a, b) => a.pct - b.pct);
  return `<div class="ready">
    <div class="ready-head">
      <div class="ready-l">
        <div class="kick">${t('ready_title')}</div>
        <div class="ready-n">
          <span class="v">${r.forecast}</span>
          <span class="of">${t('results_of')}</span>
          ${d === null ? '' : `<span class="dl${d < 0 ? ' down' : ''}">${t('ready_delta', `${d > 0 ? '+' : ''}${d}`)}</span>`}
        </div>
        <div class="ready-note">${t('ready_scale', r.sample)}</div>
      </div>
      <span class="ready-pill${short <= 0 ? ' pass' : ''}">${short > 0 ? t('ready_to_pass', short) : t('pass_badge')}</span>
    </div>
    ${weak.length ? `<div class="ready-rule"></div>
    <div class="ready-weak">
      <div class="kick">${t('ready_weak_now')}</div>
      <div class="wchips">${weak.map(x =>
        `<span class="wchip">${esc(domShort(x.id))}<span class="p">${x.pct}%</span></span>`).join('')}</div>
    </div>` : ''}
    ${readyActionHTML(plan)}
  </div>`;
}

// What was answered today, against the goal, with a fortnight of the same behind it.
function todayCardHTML() {
  const st = P();
  if (!st) return '';
  const now = Date.now();
  const day = st.dayStats(st.activity, now);
  const goal = st.goalOf(st.profile);
  const pct = Math.min(100, Math.round(day.total / goal * 100));
  const done = day.total >= goal;
  return `<div class="pcard">
    <h2>${t('learn_today')}</h2>
    <div class="dbar">
      <div class="top"><span class="nm">${t('learn_goal_line', day.total, goal)}</span>
        <span class="vl ${done ? 'g' : 'a'}">${pct}%</span></div>
      <div class="track"><div class="fill ${done ? 'g' : 'a'}" style="width:${pct}%"></div></div>
    </div>
    <div class="plan-note">${t('dash_today_line', day.total, day.wrong, day.srs, st.streakDays(st.activity, now))}</div>
    ${activityStripHTML(st.recentDays(st.activity, now, 14), goal)}
  </div>`;
}

// The two queues, as two lines: what is due and what is still wrong.
function queueRowsHTML() {
  const st = P();
  if (!st) return '';
  const due = learnDue().length, wrong = learnWrong().length;
  // Nothing due and nothing ever answered are two different states: one says the work is
  // done, the other that there is no work yet. Saying the first when it is the second
  // congratulates someone on a queue they have not started.
  const idle = Object.keys(st.srs).length ? t('learn_srs_empty') : t('learn_srs_none');
  return `<button class="rowbtn" data-act="srs"${due ? '' : ' disabled'}>
      <span class="tx"><b>${t('learn_srs')}</b><span>${due ? t('dash_srs_line', n_(due, 'question')) : idle}</span></span>
      <span class="n">${due}</span>
    </button>
    <button class="rowbtn" data-act="wrong"${wrong ? '' : ' disabled'}>
      <span class="tx"><b>${t('learn_wrong')}</b><span>${wrong ? t('dash_wrong_line') : t('learn_wrong_empty')}</span></span>
      <span class="n r">${wrong}</span>
    </button>`;
}

// The scaled score of the last few attempts that are allowed to claim one. Nothing else
// goes on here: a filtered pick graded 90% is not 930 on Cisco's scale and drawing it
// beside real attempts would say it was.
const CHART_H = 118;
function scoreChartHTML() {
  const st = P();
  if (!st) return '';
  const runs = st.scoredAttempts(st.attempts.slice().sort((a, b) => a.date - b.date)).slice(-7);
  if (runs.length < 2) return '';
  const pass = passMark();
  const at = v => Math.max(0, Math.min(CHART_H, Math.round((v - 300) / 700 * CHART_H)));
  const last = runs.length - 1;
  const move = runs[last].scaled - runs[last - 1].scaled;
  return `<div class="pcard">
    <div class="dhead"><h2>${t('dash_scores_title', n_(runs.length, 'attempt'))}</h2>
      <span class="dlink" style="cursor:default">${move > 0 ? '+' : ''}${move}</span></div>
    <div class="chart">
      <div class="chart-pass" style="bottom:${at(pass)}px"><span>${pass}</span></div>
      ${runs.map((a, i) => `<i class="${i === last ? 'last' : i >= last - 2 ? 'near' : ''}"
        style="height:${Math.max(3, at(a.scaled))}px" title="${esc(stampFull(a.date))} · ${a.scaled}"></i>`).join('')}
    </div>
    <div class="chart-vals">${runs.map((a, i) =>
      `<span class="${i === last ? 'last' : ''}">${a.scaled}</span>`).join('')}</div>
    <div class="plan-note" style="font-weight:400">${t('dash_scores_note')}</div>
  </div>`;
}

// The six domains as they actually went over the window — not as the blueprint weights
// them. The weight is still said, underneath, because it is what makes one worth more.
function domainsSectionHTML(r) {
  const rows = domainRows(r);
  if (!rows.length) return '';
  return `<div class="sec">
    <div class="dhead"><h2>${t('dash_domains_title', r.sample)}</h2>
      <button class="dlink" data-nav="weak">${t('dash_weak_link')}</button></div>
    <div class="domgrid">${rows.map(d => {
      const tone = d.pct >= WEAK_BELOW ? 'g' : d.pct >= 60 ? 'a' : 'r';
      return `<div class="dbar">
        <div class="top"><span class="nm">${domNameHTML(d.id)}</span>
          <span class="act"><span class="vl ${tone}">${d.pct}%</span>
            <button class="tiny" data-drill="${d.id}">${t('dash_domain_go')}</button></span></div>
        <div class="track"><div class="fill ${tone}" style="width:${d.pct}%"></div></div>
        <div class="foot">${t('dash_domain_foot', d.ok, d.tot, Math.round(d.weight * 100))}</div>
      </div>`;
    }).join('')}</div>
  </div>`;
}

// Domain ids and topic names come out of the bank, so the handlers are wired after the
// markup rather than inlined into it — same rule the history rows follow.
function wireDash() {
  const box = app();
  box.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => goScreen(b.dataset.nav));
  box.querySelectorAll('[data-drill]').forEach(b => b.onclick = () => startDomainRun(b.dataset.drill));
  box.querySelectorAll('[data-topic]').forEach(b => b.onclick = () => startTopicRun(b.dataset.topic));
  box.querySelectorAll('[data-act]').forEach(b => b.onclick = () => ({
    'weak-run': startWeakRun, srs: startSrsRun, wrong: startWrongRun,
    resume: resumeRun, 'resume-finish': finishPaused,
  })[b.dataset.act]?.());
  wireChapterLinks();
}

// ============================ LAB SIMULATIONS (reference only) ============================
// Hands-on Cisco SIMULATION items from the dump. They can't run offline, so they're
// excluded from scoring/pools (scorable() returns false) and shown here for reference.

// The dump stores each sim as one run-on string:
//   "SIMULATION - Guidelines - <intro> • <ui-note> • ... Topology - Tasks - <intro> 1. .. 2. .."
// or a "Task 1 - ... • sub-point" variant. Turn it into readable HTML: collapse the
// boilerplate lab-UI guidelines, and lay the actual tasks out as headed lists.
function formatSimText(t2) {
  let s = ' ' + String(t2 || '').replace(/\s+/g, ' ').trim() + ' ';
  s = s.replace(/^\s*SIMULATION\s*[-–]?\s*/i, ' ');
  const taskMode = /\bTask\s*\d+/i.test(s);                 // "Task 1", "Task 2:" style
  s = s.replace(/\s*Guidelines\s*[-–]\s*/gi, '\n@H@G\n')
       .replace(/\s*(?:Topology\s*[-–]\s*)?Tasks\s*[-–]\s*/gi, '\n@H@T\n');
  if (taskMode) s = s.replace(/\s+(Task\s*\d+)\s*[:\-–]*\s*/gi, '\n@T@$1\n');
  s = s.replace(/\s*•\s*/g, '\n@B@');                       // bullets (also "•text" no-space)
  if (!taskMode) s = s.replace(/\s+(\d+)\.\s+/g, '\n@N@$1. ');  // "1. 2. 3." numbered tasks
  const lines = s.split('\n').map(x => x.trim()).filter(Boolean);
  let h = '', list = null, guide = false;
  const closeList = () => { if (list) { h += `</${list}>`; list = null; } };
  const closeGuide = () => { if (guide) { closeList(); h += `</div></details>`; guide = false; } };
  for (const ln of lines) {
    if (ln === '@H@G') { closeList(); h += `<details class="cli-wrap sim-guide"><summary>${t('sim_guide_header')}</summary><div class="sim-guide-b">`; guide = true; }
    else if (ln === '@H@T') { closeGuide(); closeList(); h += `<div class="sim-h">${t('sim_tasks_header')}</div>`; }
    else if (ln.startsWith('@T@')) { closeList(); h += `<div class="sim-task">${esc(ln.slice(3).trim())}</div>`; }
    else if (ln.startsWith('@B@')) { if (list !== 'ul') { closeList(); h += '<ul>'; list = 'ul'; } h += `<li>${esc(ln.slice(3).trim())}</li>`; }
    else if (ln.startsWith('@N@')) { if (list !== 'ol') { closeList(); h += '<ol>'; list = 'ol'; } h += `<li>${esc(ln.slice(3).replace(/^\d+\.\s*/, '').trim())}</li>`; }
    else { closeList(); h += `<p>${esc(ln)}</p>`; }
  }
  closeGuide(); closeList();
  return h || `<p>${esc(t2)}</p>`;
}

// Worked-solution text: prose paragraphs with ```-fenced CLI command blocks in between
// (the fences are our own transcription convention, not part of the source dump).
function formatSimAnswer(text) {
  if (!text) return `<p class="muted">${t('sim_no_answer')}</p>`;
  const parts = String(text).split('```');
  let h = '';
  parts.forEach((part, i) => {
    if (i % 2 === 1) { h += `<pre class="cli">${esc(part.trim())}</pre>`; return; }
    part.trim().split(/\n\s*\n/).filter(Boolean).forEach(para => {
      const cls = /^Step\s*\d+/i.test(para) ? 'sim-task' : '';
      h += cls ? `<div class="${cls}">${esc(para)}</div>` : `<p>${esc(para)}</p>`;
    });
  });
  return h;
}

function browseSims() {
  narrow();
  SCREEN = browseSims;
  const sims = DATA.filter(q => q.y === 'sim');
  let h = `<div class="row"><button class="btn" onclick="home()">${t('nav_back')}</button></div>
    <h1>${t('sim_page_title')}</h1>
    <div class="sub">${t('sim_page_desc', sims.length)}</div>`;
  sims.forEach(q => {
    h += `<div class="card">${qBadges(q, `<span class="badge b-ex">${t('badge_sim')}</span>`)}
      <div class="exp muted" style="margin:6px 0">${t('sim_offline_short')}</div>
      ${exhibit(q)}
      <div class="sim-body">${formatSimText(q.t)}</div>${cliBlock(q.cli, q.n)}
      <details class="cli-wrap sim-answer"><summary>${t('sim_show_answer')}</summary><div class="sim-body">${formatSimAnswer(q.answer)}</div></details></div>`;
  });
  app().innerHTML = h;
}

// ============================ CONFIG ============================
let selDoms = new Set();
let selTypes = new Set();
const QTYPES = [
  { id: 'txt', labelKey: 'type_txt' },
  { id: 'ex', labelKey: 'type_ex' },
  { id: 'dd', labelKey: 'type_dd' },
];
function domChips() {
  return `<div class="row">` + META.domains.map(d =>
    `<span class="chip ${selDoms.has(d.id) ? 'on' : ''}" data-d="${d.id}" onclick="tglDom('${d.id}')">${esc(domShort(d.id))}<span class="c">${d.count}</span></span>`
  ).join('') + `</div>`;
}
function typeChips(mode) {
  // Simulations aren't scorable, so they're only offered in practice (reference cards).
  const types = mode === 'practice' ? QTYPES.concat([{ id: 'sim', labelKey: 'type_sim' }]) : QTYPES;
  return `<div class="row">` + types.map(ty => {
    const n = (ty.id === 'sim' ? DATA : POOL).filter(q => q.y === ty.id).length;
    // Simulations are reference cards: scorable() rejects them, so the chip says so too.
    const sim = ty.id === 'sim' ? ' sim' : '';
    return `<span class="chip${sim} ${selTypes.has(ty.id) ? 'on' : ''}" data-ty="${ty.id}" onclick="tglType('${ty.id}')">${esc(t(ty.labelKey))}<span class="c">${n}</span></span>`;
  }).join('') + `</div>`;
}
function tglDom(id) { selDoms.has(id) ? selDoms.delete(id) : selDoms.add(id); const el = document.querySelector(`[data-d="${id}"]`); if (el) el.classList.toggle('on'); cfgCount(); }
function tglType(id) { selTypes.has(id) ? selTypes.delete(id) : selTypes.add(id); const el = document.querySelector(`[data-ty="${id}"]`); if (el) el.classList.toggle('on'); cfgCount(); }
function domPool(includeSims) {
  // Base pool is scorable questions; in practice, fold in sim reference cards when
  // 'sim' is explicitly picked or no type filter is set ("пусто = все").
  let base = POOL;
  if (includeSims && (selTypes.size === 0 || selTypes.has('sim'))) {
    base = POOL.concat(DATA.filter(q => q.y === 'sim'));
  }
  let p = base;
  if (selDoms.size) p = p.filter(q => selDoms.has(q.dom));
  if (selTypes.size) p = p.filter(q => selTypes.has(q.y));
  return p;
}

// A segmented control where a <select> used to be. Three or four options do not deserve a
// dropdown — that is an extra tap and a different widget on every platform. The value still
// lives in an element with the same id, so startCustomExam/startPractice read it unchanged.
function segmented(id, opts, def) {
  return `<input type="hidden" id="${id}" value="${def}">
  <div class="seg" data-for="${id}">` + opts.map(o =>
    `<button type="button" class="seg-b${o.v === def ? ' on' : ''}" data-v="${o.v}"
       onclick="segPick('${id}', this)">${esc(o.label)}</button>`).join('') + `</div>`;
}
function segPick(id, el) {
  $('#' + id).value = el.dataset.v;
  el.parentElement.querySelectorAll('.seg-b').forEach(b => b.classList.toggle('on', b === el));
  cfgCount();
}
function segSet(id, v) {
  const box = document.querySelector(`.seg[data-for="${id}"]`);
  if (!box) return;
  const b = box.querySelector(`.seg-b[data-v="${v}"]`);
  if (b) segPick(id, b);
}

// How many questions the current filters actually leave. domPool() already computes it; the
// only place it used to surface was an alert after pressing Start.
function cfgCount() {
  const el = $('#cfgcount'); if (!el) return;
  const n = domPool(cfgMode === 'practice').length;
  el.textContent = n ? t('cfg_matching', n) : t('cfg_matching_none');
  el.classList.toggle('empty', n === 0);
  const go = $('#cfggo'); if (go) go.disabled = n === 0;
}
let cfgMode = 'exam';

// `keep` is set only when replaying the screen after a language change: the chips the
// user has already ticked are part of the screen, not something to reset under them.
function cfg(mode, keep) {
  narrow();
  // Replaying this screen after a language change must not reset what the user has already
  // set up. The chips live in selDoms/selTypes and survive on their own; the controls are
  // plain DOM, so their values are carried across the re-render by hand.
  SCREEN = () => {
    const was = {
      cnt: $('#cnt') && $('#cnt').value,
      min: $('#min') && $('#min').value,
      jump: $('#qstart') && $('#qstart').value,
      shuffled: $('#shf') && $('#shf').classList.contains('on'),
    };
    cfg(mode, true);
    if (was.cnt !== null && was.cnt !== undefined) segSet('cnt', was.cnt);
    if (was.min !== null && was.min !== undefined) segSet('min', was.min);
    if (was.jump && $('#qstart')) $('#qstart').value = was.jump;
    if ($('#shf')) $('#shf').classList.toggle('on', was.shuffled);
  };
  if (!keep) { selDoms = new Set(); selTypes = new Set(); }
  const isEx = mode === 'exam';
  cfgMode = mode;
  const counts = isEx
    ? [30, 60, 100].map(c => ({ v: c, label: String(c) }))
    : [20, 50, 100, 0].map(c => ({ v: c, label: c ? String(c) : t('all_option') }));
  const times = [30, 90, 120, 0].map(m => ({ v: m, label: m ? String(m) : t('cfg_no_timer') }));

  app().innerHTML = `
  <h1>${isEx ? t('label_custom_exam') : t('label_practice')}</h1>
  <div class="card">
    <div class="lbl">${t('cfg_domains_label')}</div>${domChips()}

    <div class="lbl">${t('cfg_types_label')}${isEx ? '' : t('cfg_types_sim_note')})</div>${typeChips(mode)}
    ${isEx ? '' : `<div class="hint">${t('type_sim_note')}</div>`}

    <div class="lbl">${t('cfg_count_label')}</div>
    <div class="row">
      ${segmented('cnt', counts, isEx ? 60 : 20)}
      ${isEx ? '' : `<label class="chip on" id="shf" onclick="this.classList.toggle('on')">${t('cfg_shuffle')}</label>`}
    </div>

    ${isEx ? `<div class="lbl">${t('cfg_time_label')}</div>
    <div class="row">${segmented('min', times, 90)}</div>` : ''}

    ${isEx ? '' : `<div class="jump">
      <div class="lbl">${t('cfg_jump_label')}</div>
      <input class="qstart" id="qstart" type="number" min="1" max="${maxQN()}"
        placeholder="${t('cfg_jump_placeholder', maxQN())}"
        onkeydown="if(event.key==='Enter')startPractice()">
    </div>`}

    <div class="nav">
      <button class="btn" onclick="home()">${t('nav_back')}</button>
      <span class="cfg-count" id="cfgcount"></span>
      <div class="spacer"></div>
      <button class="btn primary" id="cfggo" onclick="${isEx ? 'startCustomExam()' : 'startPractice()'}">${isEx ? t('cfg_start_exam') : t('cfg_start_practice')}</button>
    </div>
  </div>`;
  cfgCount();
}

// ============================ SELECTION ============================
// Blueprint-weighted selection across the 6 domains for the full exam.
function weightedPick(total) {
  const byDom = {};
  META.domains.forEach(d => byDom[d.id] = shuffle(POOL.filter(q => q.dom === d.id)));
  // target counts by weight, then largest-remainder to hit `total`
  const raw = META.domains.map(d => ({ id: d.id, exact: d.weight * total }));
  let picked = raw.map(r => ({ id: r.id, n: Math.floor(r.exact), frac: r.exact - Math.floor(r.exact) }));
  let sum = picked.reduce((a, b) => a + b.n, 0);
  picked.sort((a, b) => b.frac - a.frac);
  for (let i = 0; sum < total; i++, sum++) picked[i % picked.length].n++;
  const out = [];
  picked.forEach(p => { out.push(...byDom[p.id].slice(0, Math.min(p.n, byDom[p.id].length))); });
  return shuffle(out);
}

function startFullExam() {
  const qs = weightedPick(100);
  beginExam(qs, 120, { preset: 'full', weighted: true });
}
function startCustomExam() {
  const n = +$('#cnt').value, mins = +$('#min').value;
  const qs = shuffle(domPool(false)).slice(0, n);
  // Not `weighted`: a hand-picked pool is not the sample the 300..1000 scale describes, so
  // the attempt is filed as one the score cannot be compared across. Same rule as startExam
  // in the Android app.
  beginExam(qs, mins, { preset: 'custom', weighted: false });
}
const maxQN = () => DATA.reduce((m, q) => Math.max(m, q.n), 0);

function startPractice() {
  // Explicit question number wins: whole bank in order, opened at that question.
  const jn = $('#qstart') ? parseInt($('#qstart').value, 10) : 0;
  if (!clearForNewRun()) return;
  if (jn) {
    const all = DATA.slice().sort((a, b) => a.n - b.n);
    const i = all.findIndex(q => q.n === jn);
    if (i < 0) { $('#qstart').value = ''; $('#qstart').placeholder = t('practice_no_question', jn); return; }
    S = { mode: 'pr', qs: all, i, ans: {}, ok: 0, done: 0, ...practiceRun() };
    keepSession();
    return renderPractice();
  }
  let p = domPool(true);
  if ($('#shf').classList.contains('on')) p = shuffle(p);
  const c = +$('#cnt').value; if (c) p = p.slice(0, c);
  S = { mode: 'pr', qs: p, i: 0, ans: {}, ok: 0, done: 0, ...practiceRun() };
  keepSession();
  renderPractice();
}

// An answer option is set in the monospace face only when it actually is a command. In this
// bank 1172 of the 5000 options are — a pasted prompt, a multi-line config block, or a
// lowercase config line — and the other 3828 are English sentences that read worse in mono.
// Strong marks (a prompt, a mode banner, a line break) settle it on their own; otherwise the
// text also has to not look like a sentence.
const CMD_STRONG = /\n|#|\(config/;
const CMD_WEAK = /\b\d{1,3}(\.\d{1,3}){3}\b|\/\d{1,2}\b/;
const CMD_HEAD = /^(ip|ipv6|interface|router|switchport|no|show|access-list|line|spanning-tree|standby|vlan|username|crypto|snmp-server|ntp|banner|enable|service|channel-group|description|duplex|speed|shutdown|hostname|logging|aaa|clock|key|password|permit|deny|network|encapsulation|passive-interface|default-gateway)\s/;
const isCommand = txt => {
  const v = String(txt || '').trim();
  return CMD_STRONG.test(v) ||
    (!/^[A-Z][a-z]/.test(v) && !/[.!?]$/.test(v) && (CMD_WEAK.test(v) || CMD_HEAD.test(v)));
};

// The letter in the circle becomes a verdict once the question is graded.
const TICK = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const CROSS = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/></svg>`;

// One answer option, in whichever of its four states applies.
function optHTML(k, text, { cls = '', disabled = false } = {}) {
  const mark = cls.includes('correct') ? TICK : cls.includes('wrong') ? CROSS : esc(k);
  return `<button class="opt ${cls}" data-k="${k}"${disabled ? ' disabled' : ''}>` +
    `<span class="k">${mark}</span>` +
    `<span class="${isCommand(text) ? 'cmd' : ''}">${esc(text)}</span></button>`;
}

// ============================ CHROME ============================
// One strip at the top of every attempt screen, and its colour is the mode: the exam is dark
// and carries a timer, practice is light and carries the running score. That is worth more
// than a label — you can tell which one you are in before reading anything.
const CLOCK_ICON =
  `<svg class="ico-clock" width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
     <circle cx="12" cy="13" r="8" stroke="currentColor" stroke-width="2"/>
     <path d="M12 9.5V13l2.5 1.5M9 3h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

function chrome(dark, inner) {
  return `<div class="chrome${dark ? ' dark' : ''}">${inner}</div>`;
}

// Progress through the attempt: a bar and the same numbers spelled out, because a bar alone
// cannot say 14 of 100.
function chromeProgress(i, total) {
  return `<div class="chrome-progress">
    <div class="chrome-bar"><i style="width:${Math.round((i + 1) / total * 100)}%"></i></div>
    <span class="chrome-pos">${i + 1}/${total}</span></div>`;
}

// The grid's colours mean nothing on their own. This says what they mean and counts them.
function gridLegend() {
  const answered = S.qs.filter(q => S.ans[q.n] !== undefined).length;
  const flagged = S.flags ? S.flags.size : 0;
  const rest = S.qs.length - answered;
  return `<div class="legend">
    <span><i class="sw answered"></i>${t('grid_answered')} ${answered}</span>
    <span><i class="sw flagged"></i>${t('grid_flagged')} ${flagged}</span>
    <span><i class="sw"></i>${t('grid_unanswered')} ${rest}</span></div>`;
}

// ============================ QUESTION RENDER HELPERS ============================
function qBadges(q, extra = '') {
  const multi = q.y !== 'dd' && q.a.length > 1;
  let h = `<div class="badges"><span class="badge b-dom">${esc(domShort(q.dom))}</span><span class="qnum">${t('q_label', q.n)}</span>`;
  if (q.y === 'ex') h += `<span class="badge b-ex">${t('badge_exhibit')}</span>`;
  if (q.y === 'dd') h += `<span class="badge b-dd">DRAG&DROP</span>`;
  if (multi) h += `<span class="badge b-multi">${t('badge_choose', q.a.length)}</span>`;
  if (q.disp) h += `<span class="badge b-disp">${t('badge_disputed')}</span>`;
  return h + extra + `</div>`;
}
function exhibit(q) {
  // Схемы берём только из images/exhibits/ (растровые кропы из PDF); topo/*.svg — архив, не используется.
  return q.img ? `<img class="eximg" src="${IMG(q.n)}" alt="exhibit ${q.n}" loading="lazy">` : '';
}

// A question card is redrawn whole on every answer, and an <details> written out closed
// comes back closed — which is how picking an option used to collapse the CLI listing the
// question was about. Anything carrying `data-keep` is remembered by that key instead.
// Page-lifetime only: this is where the reader was looking, not something to persist.
const OPEN_DETAILS = new Set();
// `toggle` does not bubble, so the one listener has to run in the capture phase. It is
// also queued rather than fired on the spot, so it cannot be the only record: answering
// fast enough redraws the card before the browser gets round to it. The element still on
// screen is the truth while it is there, and this Set is what is left of it afterwards —
// which is what makes a question opened, left and come back to open again.
document.addEventListener('toggle', e => {
  const key = e.target && e.target.dataset ? e.target.dataset.keep : null;
  if (!key) return;
  e.target.open ? OPEN_DETAILS.add(key) : OPEN_DETAILS.delete(key);
}, true);
const keepAttrs = key => {
  if (!key) return '';
  // Called while building the replacement markup, so the old screen is still up.
  const live = document.querySelector(`[data-keep="${key}"]`);
  const open = live ? live.open : OPEN_DETAILS.has(key);
  return ` data-keep="${key}"${open ? ' open' : ''}`;
};

// CLI/config/show-output text, extracted from the exhibit or embedded question text.
// Short snippets render as a plain code block; long ones collapse behind a toggle —
// one the reader opens once per question, not once per answer (see keepAttrs).
function cliBlock(text, qn = null) {
  if (!text) return '';
  const lines = text.split('\n');
  const long = lines.length > 4 || text.length > 220;
  const body = `<pre class="cli">${esc(text)}</pre>`;
  if (!long) return `<div class="cli-wrap">${body}</div>`;
  return `<details class="cli-wrap"${keepAttrs(qn === null ? null : `cli:${qn}`)}><summary>${t('cli_show', lines.length)}</summary>${body}</details>`;
}

// Split an explanation into sentence-level parts so it reads as separate lines
// instead of one wall of text.
function expParts(t) {
  return String(t || '').trim()
    .split(/(?<=[.!?…])\s+(?=[«"“(A-ZА-Я0-9])/)
    .map(s => s.trim()).filter(Boolean);
}
// A readable explanation block: short ones render in full; long ones are collapsed
// behind a real spoiler — nothing is shown until the summary is clicked, unlike the
// old "first sentence always visible" preview, which read as a half-open spoiler.
function expHTML(text, wrapCls, wrapTag) {
  const parts = expParts(text);
  const P = p => `<p>${esc(p)}</p>`;
  const long = String(text).length > 240 && parts.length > 2;
  const inner = long
    ? `<details class="exp-toggle"><summary>${t('exp_show', parts.length)}</summary>` +
      `<div class="exp-scroll">${parts.map(P).join('')}</div></details>`
    : parts.map(P).join('');
  return `<${wrapTag} class="${wrapCls}">${inner}</${wrapTag}>`;
}
const expBlock = (text, cls = '') => text ? expHTML(text, `exp ${cls}`.trim(), 'div') : '';
const rtextBlock = text => text ? expHTML(text, 'rtext', 'div') : '';

// Per-option rationale: q.why = {A:"...", B:"..."} — why each option is right/wrong.
// Falls back to the older single-paragraph q.exp when q.why isn't available yet.
// In EN mode, `why_en`/`exp_en` are preferred over the Russian `why`/`exp` — added to the
// bank separately (see ccna-exam-simulator/data/questions.json), not always present for
// every entry, so both fall back to the Russian original rather than showing nothing:
// per-option for `why` (an entry can have why_en for most keys and be missing one — falling
// back key by key beats falling back to the whole Russian object, which would silently drop
// the translation on every other option too), per-question for `exp`.
function rationale(q, given) {
  const whyEn = LANG === 'en' ? q.why_en : null;
  const exp = (LANG === 'en' && q.exp_en) || q.exp || null;
  if (q.y === 'dd' || !q.o || !Object.keys(q.o).length) {
    return exp ? expBlock(exp, q.disp ? 'disp' : '') : (q.disp ? `<div class="exp disp">${t('disputed_note')}</div>` : '');
  }
  if (!q.why) {
    let fb = `<div class="verdict ok" style="font-size:13px;margin:6px 0">${t('key_label', q.a.split('').join(', '))}</div>`;
    fb += exp ? expBlock(exp, q.disp ? 'disp' : '') : (q.disp ? `<div class="exp disp">${t('disputed_note')}</div>` : `<div class="exp muted">${t('no_explanation_yet')}</div>`);
    return fb;
  }
  // Which option blocks to show:
  //  • multi-answer question (choose 2-3): show every option in full;
  //  • single-answer, correct: only the correct option's block;
  //  • single-answer, wrong: the wrongly-picked option AND the correct one.
  const multi = q.a.length > 1;
  const answeredOk = !!given && given.slice().sort().join('') === q.a.split('').sort().join('');
  let h = `<div class="rationale">`;
  for (const k of Object.keys(q.o)) {
    const ok = q.a.includes(k), picked = !!(given && given.includes(k));
    const show = multi ? true : (answeredOk ? ok : (picked || ok));
    if (!show) continue;
    let tag = ok ? t('tag_correct') : t('tag_incorrect');
    if (picked && !ok) tag += t('your_choice');
    else if (multi && !picked && ok) tag += t('missed');
    h += `<div class="ropt ${ok ? 'ok' : 'bad'}"><div class="rhead"><b>${k}.</b> ${esc(q.o[k])} <span class="tag">${tag}</span></div>`;
    const why = (whyEn && whyEn[k]) || (q.why && q.why[k]);
    if (why) h += rtextBlock(why);
    h += `</div>`;
  }
  h += `</div>`;
  if (q.disp) h += `<div class="exp disp">${t('disputed_note')}</div>`;
  return h;
}

// ============================ PROGRESS & HISTORY ============================
// Everything a finished run leaves behind. The store (assets/js/store.js) keeps it in the
// same seven branches, under the same names and in the same shapes, as the Android app —
// which is what makes the exported file interchangeable between the two.
//
// Nothing in here is allowed to break a run: if the store did not load, every call is a
// no-op and the trainer behaves exactly as it did before it existed.

// Cisco's 300..1000 scale, from the shared module when it is there. The fallback is the
// same formula, kept only so a storeless page still prints a score.
const toScaled = pct => { const st = P(); return st ? st.toScaled(pct) : Math.round(300 + (pct / 100) * 700); };
const passMark = () => { const st = P(); return st ? st.PASS_SCALED : 825; };

const attemptId = startedAt => { const st = P(); return st ? st.attemptId(startedAt) : `local-${startedAt}`; };

// The two fields every practice run needs to be filed as an attempt later.
const practiceRun = () => { const startedAt = Date.now(); return { startedAt, attemptId: attemptId(startedAt) }; };

function recordAnswer(qn, ok, mode) {
  const st = P();
  if (st && !S.replay) st.recordAnswer(qn, ok, mode);
}

// Attempts carry the raw answers, not just the totals: the statistics on both clients are
// recomputed from them, so a fix to the bank or to the grading rules reaches old attempts
// instead of freezing yesterday's verdict into the history.
function saveExamAttempt(rev, perDom, ok, pct, scaled) {
  const st = P();
  if (!st || S.replay) return;
  // An exam withholds feedback until the end, so this is the first moment its answers can
  // reach the repetition map. Unanswered questions score as wrong but were never seen, so
  // they are not scheduled for repetition.
  st.recordAnswers(rev.filter(r => S.ans[r.q.n] !== undefined).map(r => [r.q.n, r.good]), 'exam');
  st.saveAttempt({
    id: S.attemptId, date: Date.now(), mode: 'exam', preset: S.preset || null,
    weighted: !!S.weighted, scaled, pct, ok, total: S.qs.length, perDomain: perDom,
    durationMs: Date.now() - S.startedAt, answers: S.ans, qs: S.qs.map(q => q.n),
  });
}

// Practice files only what was actually answered. The run can be the whole 1395-question
// bank, and the unanswered rest are not wrong answers — counting them as such would drag
// every topic statistic on both devices down to nothing.
function savePracticeAttempt(rev) {
  const st = P();
  if (!st || S.replay || !rev.length) return;
  const perDomain = {};
  META.domains.forEach(d => perDomain[d.id] = { ok: 0, tot: 0 });
  for (const { q, good } of rev) {
    const d = perDomain[q.dom];
    if (!d) continue;
    d.tot++; if (good) d.ok++;
  }
  const ok = rev.filter(r => r.good).length;
  const pct = Math.round(ok / rev.length * 100);
  const answers = {};
  for (const { q } of rev) answers[q.n] = S.ans[q.n];
  // Same id every time: the review sheet is reachable mid-run, so finishing twice has to
  // update one attempt rather than file a second one.
  st.saveAttempt({
    id: S.attemptId, date: Date.now(), mode: 'practice', preset: null, weighted: false,
    scaled: toScaled(pct), pct, ok, total: rev.length, perDomain,
    durationMs: Date.now() - S.startedAt, answers, qs: rev.map(r => r.q.n),
  });
}

// ---- history ----
const attrEsc = v => esc(v).replace(/"/g, '&quot;');

// The exam date, as it is stored ('YYYY-MM-DD') and as it is read ('14.10.2026'). Split by
// hand rather than through Date: the string is a calendar day, and parsing it would make it
// a UTC instant that reads back as the day before east of UTC — see shared/localdate.js.
const stampDay = iso => {
  const [y, m, d] = String(iso || '').split('-');
  return y ? `${d}.${m}.${y}` : '';
};

const stampFull = ts => {
  const d = new Date(ts);
  const p2 = n => String(n).padStart(2, '0');
  return `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
};

// The scale is only meaningful for a blueprint-weighted exam — see startCustomExam. Every
// other attempt shows what it honestly has: how many were right.
// Three kinds, because the phone files three: an exam, a practice run, and a repetition
// session. The site only starts the first two, but a synced attempt from Android can be
// any of them and must not be labelled as an exam it never was.
const attemptKind = a => a.mode === 'exam' ? t('hist_mode_exam')
  : a.mode === 'srs' ? t('hist_mode_srs')
  : t('hist_mode_practice');

// An attempt that was opened and walked away from is not a result — the questions never
// reached were graded as wrong, and the 300..1000 score that comes out of that describes
// the walking away. So it shows what it honestly has: how many of the answers actually
// given were right. See isAbandoned in shared/progress.js.
const dropped = a => { const st = P(); return !!st && st.isAbandoned(a); };
const askedIn = a => { const st = P(); return st ? st.answeredIn(a) : a.total; };

const attemptScore = a => {
  if (dropped(a)) {
    const asked = askedIn(a);
    return `<span class="hs-val">${a.ok}/${asked}</span><span class="hs-of">${t('hist_not_counted')}</span>`;
  }
  return a.weighted
    ? `<span class="hs-val">${a.scaled}</span><span class="hs-of">/ 1000</span>`
    : `<span class="hs-val">${a.pct}%</span><span class="hs-of">${t('hist_unscored')}</span>`;
};

// One attempt as a fold: the same line as above for the summary, and underneath it what
// that run actually says — how each domain went, and what is left to work on.
//
// <details> rather than a class the click handlers toggle: the browser already knows how
// to open one, keyboard and screen reader included, and an accordion whose state lives in
// the DOM survives the re-render that follows deleting a row.
function attemptFoldHTML(a) {
  const mins = Math.max(1, Math.round((a.durationMs || 0) / 60000));
  const kind = attemptKind(a);
  const wrong = mistakesIn(a);
  const perDom = perDomainIn(a);
  const doms = (META ? META.domains : [])
    .map(d => ({ d, p: perDom[d.id] }))
    .filter(x => x.p && x.p.tot)
    .map(({ d, p }) => {
      const pc = Math.round(p.ok / p.tot * 100);
      return `<span class="dchip ${pc >= 80 ? 'g' : pc >= 60 ? 'a' : 'r'}">${esc(domShort(d.id))} ${p.ok}/${p.tot} · ${pc}%</span>`;
    }).join('');
  return `<details class="hitem">
    <summary class="hist-row">
      <div class="hist-when">${esc(stampFull(a.date))}</div>
      <div class="hist-what">${esc(kind)} · ${dropped(a)
        ? t('hist_abandoned', askedIn(a), a.total)
        : `${t('correct_pct', a.ok, a.total, a.pct)} · ${t('hist_minutes', mins)}`}</div>
      <div class="hist-score ${!dropped(a) && a.weighted && a.scaled >= passMark() ? 'pass' : ''}">${attemptScore(a)}</div>
    </summary>
    <div class="hist-more">
      ${doms ? `<div class="dchips">${doms}</div>` : ''}
      <div class="row">
        <span class="exp muted">${wrong.length ? t('hist_mistakes', wrong.length) : t('hist_no_mistakes')}</span>
        <div class="spacer"></div>
        ${wrong.length ? `<button class="btn sm" data-fix="${attrEsc(a.id)}">${t('hist_fix')}</button>` : ''}
        <button class="btn sm" data-open="${attrEsc(a.id)}">${t('hist_open')}</button>
        <button class="btn sm" data-del="${attrEsc(a.id)}" title="${t('hist_delete')}" aria-label="${t('hist_delete')}">✕</button>
      </div>
    </div>
  </details>`;
}

// Questions this attempt got wrong and the bank still has. The shared rule does the work;
// this only binds the grading, the way every other call from here does.
const mistakesIn = a => {
  const st = P();
  return st ? st.mistakesOf(a, byN(), isCorrect) : [];
};

// The per-domain tally to draw: the one filed with the attempt, or — for an abandoned run
// — one recomputed over the questions that were actually answered.
const perDomainIn = a => {
  const st = P();
  return st ? st.perDomainOf(a, byN(), isCorrect) : (a.perDomain || {});
};

// Exams and practice runs are two different questions ("am I ready?" and "did I work
// today?"), so they get two folds rather than one list sorted by date. A group with
// nothing in it is not drawn — an empty "Practice · 0" is furniture, not information.
function attemptGroupsHTML(all) {
  const groups = [
    { label: 'hist_group_exams', rows: all.filter(a => a.mode === 'exam') },
    { label: 'hist_group_practice', rows: all.filter(a => a.mode !== 'exam') },
  ].filter(g => g.rows.length);
  // Both open when there is one group, the exams open when there are two: whichever fold
  // the screen is mostly about should not need a click to read.
  return groups.map((g, i) => `<details class="hgrp"${i === 0 ? ' open' : ''}>
    <summary><span class="hgrp-t">${t(g.label)}</span><span class="hgrp-n">${g.rows.length}</span></summary>
    <div class="hist">${g.rows.map(attemptFoldHTML).join('')}</div>
  </details>`).join('');
}

// Wired after innerHTML rather than through inline onclick: an attempt id can come from an
// imported file, and nothing that arrives in a file belongs in an HTML attribute handler.
function wireHistory(rerender) {
  document.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openAttempt(b.dataset.open));
  document.querySelectorAll('[data-fix]').forEach(b => b.onclick = () => startAttemptRun(b.dataset.fix));
  document.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    if (!confirm(t('hist_delete_confirm'))) return;
    const st = P(); if (st) st.deleteAttempt(b.dataset.del);
    rerender();
  });
}


function historyScreen() {
  SCREEN = historyScreen;
  NAV_AT = 'history';
  const st = P();
  const all = st ? st.recentAttempts() : [];
  app().innerHTML = `
    <div>
      <h1>${t('hist_title')}</h1>
      <div class="sub">${t('hist_retention')}</div>
    </div>
    ${all.length ? attemptGroupsHTML(all) : `<div class="exp muted">${t('hist_none')}</div>`}`;
  wireHistory(historyScreen);
  window.scrollTo(0, 0);
}

// ============================ PROGRESS ============================
// Where the progress itself is looked after rather than read: the key that carries it to
// the phone, the file that carries it anywhere, and the two dates the plan is made of.
function progressScreen(msg = '') {
  SCREEN = progressScreen;
  NAV_AT = 'progress';
  const st = P();
  app().innerHTML = `
    <div>
      <h1>${t('hist_open_screen')}</h1>
      <div class="sub">${t('sync_note')}</div>
    </div>
    ${syncSectionHTML()}
    <div class="pcard">
      <h2>${t('backup_title')}</h2>
      <div class="plan-note" style="font-weight:400">${t('hist_transfer_note')}</div>
      <div class="row">
        <button class="btn sm" onclick="exportProgress()">${t('hist_export')}</button>
        <button class="btn sm" onclick="importProgress()">${t('hist_import')}</button>
      </div>
    </div>
    ${planSectionHTML()}`;
  if (msg) setSyncMsg(msg);
  wirePlan();
  window.scrollTo(0, 0);
}

// The two numbers the sidebar counts down on: when the exam is, and how much is meant to
// be answered a day. Both live in the synced profile, so the phone reads what is set here.
function planSectionHTML() {
  const st = P();
  if (!st) return '';
  const plan = planState();
  const left = plan.left;
  const line = left === null ? t('plan_days_none')
    : left < 0 ? t('plan_days_past')
    : t('plan_days_left', left);
  return `<div class="pcard">
    <h2>${t('plan_title')}</h2>
    <div class="planset">
      <label class="goalset">${t('plan_exam_date')}
        <input id="examdate" type="date" value="${attrEsc(st.profile.examDate || '')}"></label>
      <label class="goalset">${t('learn_goal_set')}
        <input id="goal" type="number" min="1" max="500" step="5" value="${st.goalOf(st.profile)}"></label>
    </div>
    <div class="plan-note">${mockLine(plan)} · ${line}</div>
  </div>`;
}

// Committed on change rather than on every keystroke: typing "40" passes through "4", and
// a goal of 4 written to the synced profile on the way is not what was meant. A half-typed
// date is the same story — an <input type=date> reports '' until all three parts are in.
function wirePlan() {
  const st = P();
  if (!st) return;
  // Both numbers are also drawn in the sidebar's countdown, which is not part of the
  // screen being redrawn — hence renderSide() alongside.
  const redraw = () => { progressScreen(); renderSide(); };
  const goal = document.getElementById('goal');
  if (goal) goal.onchange = () => { st.setGoal(parseInt(goal.value, 10)); redraw(); };
  const date = document.getElementById('examdate');
  if (date) date.onchange = () => { st.setExamDate(date.value); redraw(); };
}

// Re-open a stored attempt on the screen it was first shown on. Questions the bank no
// longer has (or never had — the file may come from a phone on another build) drop out of
// the review; the totals in the header stay the ones the attempt was scored with.
function openAttempt(id) {
  const st = P();
  const a = st ? st.attemptById(id) : null;
  if (!a) return;
  const qs = (a.qs || []).map(n => byN().get(n)).filter(Boolean);
  // A copy: `S.ans` is what the answer handlers write into, and nothing looking at an old
  // result may edit the stored attempt. `ex-done` for the same reason — it is not `ex`, so
  // the arrow keys cannot walk a finished attempt back into the exam screen.
  const ans = { ...(a.answers || {}) };
  const rev = qs.map(q => ({ q, good: isCorrect(q, ans[q.n]) }));
  // Only an exam gets the exam report; a practice run and the phone's repetition session
  // are both "a list of questions I went through" and read as the practice review.
  const asExam = a.mode === 'exam';
  S = { mode: asExam ? 'ex-done' : 'pr-done', qs, i: 0, ans, flags: new Set(),
    replay: true, attempt: a, reviewFilter: rev.some(r => !r.good) ? 'bad' : 'all' };
  if (!asExam) {
    S.result = { rev, ok: rev.filter(r => r.good).length };
    renderPracticeResults();
  } else {
    S.result = { rev, perDom: perDomainIn(a), ok: a.ok, pct: a.pct, scaled: a.scaled,
      pass: !dropped(a) && a.scaled >= passMark(), total: a.total,
      abandoned: dropped(a), asked: askedIn(a) };
    renderResults();
  }
}

const replayNote = () => S.replay && S.attempt
  ? `<div class="exp muted">${t('hist_replay_note', esc(stampFull(S.attempt.date)))}</div>` : '';

// ---- transfer ----
// A plain download and a plain file picker: the same v:1 JSON the phone hands to the
// Android share sheet, no server in between. That is variant A of the sync plan, and it
// already answers "I passed a test on the site and want it on my phone".
function exportProgress() {
  const st = P(); if (!st) return;
  const json = JSON.stringify(st.toBackup(), null, 2);
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `ccna-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importProgress() {
  const st = P(); if (!st) return;
  if (st.attempts.length && !confirm(t('hist_import_replace', st.attempts.length))) return;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let data;
      try { data = JSON.parse(reader.result); } catch { alert(t('hist_import_bad')); return; }
      try { st.restore(data); } catch { alert(t('hist_import_bad')); return; }
      alert(t('hist_imported', st.attempts.length));
      progressScreen();
      renderSide();
    };
    reader.onerror = () => alert(t('hist_import_bad'));
    reader.readAsText(file);
  };
  input.click();
}

// ---- sync ----
// The whole feature on screen: a key, a button, and one line saying what happened. The
// protocol, the merge and the retries are in assets/js/shared/, imported by store.js —
// this file is a classic script and only ever talks to window.Store.
const SYNC_ERR = {
  key: 'sync_err_key', auth: 'sync_err_auth', closed: 'sync_err_closed', shrink: 'sync_err_shrink',
  offline: 'sync_err_offline',
  server: 'sync_err_server', corrupt: 'sync_err_corrupt', conflict: 'sync_err_conflict',
};

const syncStatus = () => {
  const st = P();
  const at = st && st.sync.syncedAt;
  return at ? t('sync_last', esc(stampFull(at))) : t('sync_never');
};

function setSyncMsg(text) {
  const el = document.getElementById('syncmsg');
  if (el) el.textContent = text;
}

function syncSectionHTML() {
  const st = P();
  if (!st) return '';
  const key = st.sync.key || '';
  return `<div class="pcard">
    <h2>${t('sync_title')}</h2>
    <div class="row">
      <input class="synckey" id="synckey" type="text" spellcheck="false" autocomplete="off"
             autocapitalize="off" placeholder="${t('sync_key_ph')}" value="${attrEsc(key)}">
    </div>
    <div class="row">
      <button class="btn sm" onclick="runSync()">${t('sync_go')}</button>
      <button class="btn sm" onclick="makeSyncKey()">${t('sync_new')}</button>
      ${key ? `<button class="btn sm" onclick="copySyncKey()">${t('sync_copy')}</button>
      <button class="btn sm" onclick="forgetSyncKey()">${t('sync_forget')}</button>` : ''}
    </div>
    <div class="exp muted" id="syncmsg">${syncStatus()}</div>
  </div>`;
}

// Generated here rather than typed: 32 characters out of a 64-character alphabet is not
// something anyone invents at a keyboard, and this is the only secret in the system.
function makeSyncKey() {
  const st = P(); if (!st) return;
  st.setSync({ key: st.newSyncKey() });
  progressScreen(t('sync_created'));
}

function copySyncKey() {
  const st = P(); if (!st || !st.sync.key) return;
  navigator.clipboard?.writeText(st.sync.key).then(
    () => setSyncMsg(t('sync_copied')),
    () => {},
  );
}

function forgetSyncKey() {
  const st = P(); if (!st) return;
  if (!confirm(t('sync_forget_confirm'))) return;
  st.setSync({ key: null, syncedAt: 0, rev: 0 });
  progressScreen();
}

async function runSync() {
  const st = P(); if (!st) return;
  const key = (document.getElementById('synckey')?.value || '').trim();
  if (!st.isSyncKey(key)) return setSyncMsg(t('sync_err_key'));
  if (key !== st.sync.key) st.setSync({ key, syncedAt: 0, rev: 0 });
  setSyncMsg(t('sync_running'));
  try {
    // "Nothing changed" only when nothing moved either way: a sync that brought the other
    // device's work down writes nothing, and reporting no change would be the opposite of
    // what just happened.
    const { wrote, pulled } = await st.syncNow();
    // The history above the button is now someone else's too — redraw it, then say so.
    progressScreen(t(wrote || pulled ? 'sync_done' : 'sync_nochange', st.attempts.length));
  } catch (err) {
    setSyncMsg(t(SYNC_ERR[err && err.code] || 'sync_err_server'));
  }
}

// ============================ LEARN ============================
// What the phone's «Учить» tab does, in the browser: the repetition queue, the mistakes,
// and the topics that keep costing points. Every rule behind it — when a question is due,
// what counts as weak, how a streak is counted — comes from assets/js/shared/ through
// window.Store, so both devices answer these questions the same way.

const learnDue = () => {
  const st = P();
  return st ? st.dueQueue(st.srs, Date.now(), { has: n => byN().has(n) }) : [];
};

const learnWrong = () => {
  const st = P();
  return st ? st.wrongQueue(st.srs, { has: n => byN().has(n) }) : [];
};

// One bar per day, tallest where the most was answered. Deliberately plain: fourteen divs
// say what a chart library would. Height is relative to the busiest day; colour says
// whether the day's goal was met, which height alone cannot — a 40-answer day is short
// beside a 90-answer one and was still a full day's work.
function activityStripHTML(days, goal) {
  const peak = Math.max(1, ...days.map(d => d.total));
  return `<div class="strip" role="img" aria-label="${t('learn_days')}">${days.map(d => {
    const h = d.total ? Math.max(8, Math.round((d.total / peak) * 100)) : 3;
    const tone = !d.total ? '' : d.total >= goal ? 'on' : 'part';
    return `<i class="${tone}" style="height:${h}%" title="${esc(d.key)} · ${d.total}"></i>`;
  }).join('')}</div>`;
}

function weakScreen() {
  SCREEN = weakScreen;
  NAV_AT = 'weak';
  const st = P();
  // Without the bank every queue reads as empty, and an empty queue here says «everything
  // is repeated» — a lie that would send someone away from work they have waiting. Staying
  // put is the honest answer: this screen is only reachable from inside the trainer, where
  // the bank is loaded, so getting here without one means something else already went
  // wrong and home() would fail on the same missing data.
  if (!st || !byN().size) return;

  const r = readyNow();
  const plan = weakMixPlan();
  const due = learnDue();
  const wrong = learnWrong();
  const next = st.nextDueAt(st.srs, { has: n => byN().has(n) });
  const topics = st.weakTopics(st.attempts, byN(), isCorrect);
  const sample = r ? r.sample : 0;

  app().innerHTML = `
  <div>
    <h1>${t('weak_title')}</h1>
    <div class="sub">${t('learn_topics_note')}</div>
  </div>

  <div class="mixbar">
    <div class="tx">
      <div class="kick">${t('weak_mix_title')}</div>
      ${plan.length
        ? `<div class="mx">${esc(mixLine(plan))}</div>
           <div class="rule">${t('weak_mix_rule', sample)}</div>`
        : `<div class="mx">${r && r.forecast !== null ? t('weak_mix_none') : t('ready_empty')}</div>`}
    </div>
    ${plan.length ? `<button class="go" data-act="weak-run">${t('weak_go')}</button>` : ''}
  </div>

  ${plan.length ? `<div class="sec">
    <h2>${t('weak_doms_title')}</h2>
    ${plan.map(d => {
      const qns = domainChapterQs(d.id);
      // What this domain is costing on the 300..1000 scale: its blueprint weight times
      // the share of it that went wrong, over the 700 points the scale spans.
      const cost = Math.round(d.weight * (1 - d.pct / 100) * 700);
      return `<div class="wdom">
        <div class="wdom-top">
          <span class="nm">${domNameHTML(d.id)}</span>
          <span class="sc">${d.ok} / ${d.tot} · ${d.pct}%</span>
        </div>
        <div class="track"><div class="fill r" style="width:${d.pct}%"></div></div>
        <div class="cost">${t('weak_dom_cost', Math.round(d.weight * 100), n_(d.tot - d.ok, 'mistake'), d.tot, n_(cost, 'point'))}</div>
        <div class="acts">
          <button class="tiny lg" data-drill="${d.id}">${t('weak_dom_go', d.mix)}</button>
          ${chapterSlot(qns)}
        </div>
      </div>`;
    }).join('')}
  </div>` : ''}

  ${topics.length ? `<div class="sec">
    <h2>${t('learn_topics')}</h2>
    ${topics.map(x => `<div class="wtopic">
      <span class="nm">${esc(x.topic)}</span>
      <span class="cnt">${t('learn_topic_row', x.ok, x.tot, x.pct).split(' · ')[0]}</span>
      <span class="pc${x.pct >= 60 ? ' a' : ''}">${x.pct}%</span>
      <span class="acts">
        <button class="tiny" data-topic="${attrEsc(x.topic)}">${t('learn_topic_go')}</button>
        ${chapterSlot(someQOf(q => q.tp === x.topic && q.dom === x.dom))}
      </span>
    </div>`).join('')}
  </div>` : ''}

  <div class="dgrid">
    <div class="pcard">
      <h2>${t('learn_srs')}</h2>
      <div class="exp muted">${t('learn_srs_note')}</div>
      ${due.length
        ? `<button class="tiny lg" style="align-self:flex-start" data-act="srs">${t('learn_srs_go', due.length)}</button>`
        : `<div class="plan-note">${Object.keys(st.srs).length
            ? `${t('learn_srs_empty')} ${next ? t('learn_srs_next', esc(stampFull(next))) : ''}`
            : t('learn_srs_none')}</div>`}
    </div>
    <div class="pcard">
      <h2>${t('learn_wrong')}</h2>
      <div class="exp muted">${t('learn_wrong_note')}</div>
      ${wrong.length
        ? `<button class="tiny lg" style="align-self:flex-start" data-act="wrong">${t('learn_wrong_go', wrong.length)}</button>`
        : `<div class="plan-note">${t('learn_wrong_empty')}</div>`}
    </div>
  </div>`;

  wireDash();
  window.scrollTo(0, 0);
}

// The runs. All of them are the practice screen over a chosen set — the difference is
// only which questions, and whether the answers count as a repetition in the day's tally.
// ============================ THE RUN IN PROGRESS ============================
// A run used to exist only in `S`, which meant every way out of it was destructive: the
// sidebar and the ✕ threw an exam away, walking out of practice filed whatever had been
// answered as a finished attempt, and a reload — or opening the textbook from a graded
// answer, which is how this was noticed — lost the run with no way back to it.
//
// So a live run is written to the store as it goes (store.saveSession), and leaving one is
// a pause. Three things follow from that: the dashboard can offer it back, the history only
// ever receives runs that were actually finished, and starting a new run has to say out
// loud that it replaces the paused one.
//
// The stored shape is the phone's, field for field — `session` is a branch of the v:1 save
// file, so a file exported here has to describe the same run over there. Question numbers,
// not questions: the bank is 3 MB.
const SESSION_KIND = { exam: 'resume_exam', practice: 'resume_practice', srs: 'resume_srs' };

function snapshotSession() {
  if (S.replay || !Array.isArray(S.qs) || !S.qs.length) return null;
  if (S.mode !== 'ex' && S.mode !== 'pr') return null;      // a finished run is not a session
  return {
    mode: S.mode === 'ex' ? 'exam' : S.srsRun ? 'srs' : 'practice',
    preset: S.preset || null,
    weighted: !!S.weighted,
    qs: S.qs.map(q => q.n),
    i: S.i,
    answers: S.ans,
    flags: S.flags ? [...S.flags] : [],
    // An absolute deadline, not a remaining duration — the clock has to keep running while
    // the tab is closed, or closing it would buy time. Same rule on the phone.
    endsAt: S.end || 0,
    startedAt: S.startedAt,
  };
}

// Called after every change worth coming back to. The store coalesces writes and flushes
// on pagehide, so this is cheap enough to call on each answer.
function keepSession() {
  const st = P(), snap = snapshotSession();
  if (st && snap) st.saveSession(snap);
}

// The stored run, if it is still usable. `build_data.py` can renumber or drop a question
// between deployments, and a session pointing at numbers the bank no longer has cannot be
// resumed — that is not an error to report, it is a stale session to forget.
function pausedSession() {
  const st = P();
  const sn = st && st.session;
  if (!sn || !Array.isArray(sn.qs) || !sn.qs.length || !sn.startedAt) return null;
  if (!DATA.length) return sn;                    // pre-boot: the card can be drawn anyway
  if (sn.qs.every(n => byN().has(n))) return sn;
  st.clearSession();
  return null;
}

const sessionAnswered = sn => Object.keys(sn.answers || {}).length;

// Rebuild `S` from the stored run and put the reader back on the question they left.
function resumeRun() {
  const sn = pausedSession();
  if (!sn) return goScreen('home');
  narrow();
  const qs = sn.qs.map(n => byN().get(n));
  const common = {
    qs, i: Math.min(Math.max(sn.i || 0, 0), qs.length - 1),
    ans: { ...(sn.answers || {}) },
    startedAt: sn.startedAt, attemptId: attemptId(sn.startedAt),
  };
  if (sn.mode === 'exam') {
    S = { mode: 'ex', ...common, flags: new Set(sn.flags || []), end: sn.endsAt || 0, tid: null,
      preset: sn.preset || null, weighted: !!sn.weighted };
    // The deadline may well have passed while the tab was closed. That run is over, and
    // finishing it is the honest reading — if too little of it was answered, dropped()
    // files it as walked away from rather than as a score.
    if (S.end && Date.now() >= S.end) return finishExam();
    if (S.end) S.tid = setInterval(tick, 1000);
    renderExam();
  } else {
    // `ok` and `done` are tallies of what is already in `answers`, so they are recounted
    // rather than stored — one less pair of numbers that can disagree with the answers.
    const given = Object.values(common.ans);
    S = { mode: 'pr', ...common, srsRun: sn.mode === 'srs',
      done: given.length, ok: given.filter(a => a && a.ok).length };
    renderPractice();
  }
  NAV_AT = null;
  renderSide();
}

// Finish a paused run without opening it: grade what is there and file it, which is the
// other half of "an unfinished run does not reach the history" — it reaches it when the
// reader says it is finished.
function finishPaused() {
  const sn = pausedSession();
  if (!sn || !confirm(t('resume_finish_confirm'))) return;
  resumeRun();
  if (S.mode === 'ex') finishExam();
  else if (S.mode === 'pr') finishPractice();
}

function dropPaused() {
  const st = P();
  if (st) st.clearSession();
}

// Leaving a screen that holds a live run. Nothing is filed and nothing is thrown away —
// only the clock is stopped, because a paused exam keeps its deadline in `endsAt` and
// rebuilds the interval on the way back in.
function pauseRun() {
  if (S.mode !== 'ex' && S.mode !== 'pr') return;
  // Nothing answered and never moved off the first question — there is nothing to come
  // back to, and offering it would be clutter on the dashboard rather than a rescue.
  if (!S.i && !Object.keys(S.ans || {}).length) dropPaused();
  else keepSession();
  if (S.tid) { clearInterval(S.tid); S.tid = null; }
}

// The one warning left on the way out. An untimed run loses nothing by being paused, so
// asking would be noise; a timed one keeps counting down whether or not anyone is looking.
const confirmLeave = () => !(S.mode === 'ex' && S.end) || confirm(t('pause_timed'));

// Starting a run while another one is unfinished. The unfinished one is dropped rather
// than filed — half an exam is not a result — so this is the moment to say so.
//
// It can be unfinished in two ways: paused in the store, or still live in `S` behind the
// screen being looked at. The second is not theoretical — the textbook keeps the run alive
// while a chapter is open, and that chapter offers to practise its own questions.
function clearForNewRun() {
  if ((inRun() || pausedSession()) && !confirm(t('resume_replace'))) return false;
  dropPaused();
  return true;
}

// Back to a run from a screen that does not replace it — the textbook, above all: opening
// a chapter from a graded answer keeps `S` alive but used to leave no way back to it.
const inRun = () => S.mode === 'ex' || S.mode === 'pr';

const backRunHTML = () => inRun()
  ? `<button class="btn sm backrun" onclick="backToRun()">${t('back_to_run', S.i + 1, S.qs.length)}</button>`
  : '';

function backToRun() {
  if (!inRun()) return goScreen('home');
  narrow();
  NAV_AT = null;
  renderSide();
  if (S.mode === 'ex') {
    if (S.end && Date.now() >= S.end) return finishExam();
    if (S.end && !S.tid) S.tid = setInterval(tick, 1000);
    renderExam();
  } else renderPractice();
}

function startRun(numbers, { srs = false } = {}) {
  const qs = numbers.map(n => byN().get(n)).filter(Boolean);
  if (!qs.length) return;
  if (!clearForNewRun()) return;
  narrow();
  S = { mode: 'pr', qs, i: 0, ans: {}, ok: 0, done: 0, srsRun: srs, ...practiceRun() };
  keepSession();
  renderPractice();
}

const startSrsRun = () => startRun(learnDue(), { srs: true });
const startWrongRun = () => startRun(learnWrong());

function startTopicRun(topic) {
  const pool = DATA.filter(q => scorable(q) && (q.tp || 'General') === topic);
  startRun(shuffle(pool).slice(0, 20).map(q => q.n));
}

// The mistakes of one stored attempt, from the fold that lists them. Not the same set as
// startWrongRun: that one is "everything I currently have wrong", this one is "what went
// wrong in this run" — a question fixed since then is still part of what that attempt was.
function startAttemptRun(id) {
  const st = P();
  const a = st ? st.attemptById(id) : null;
  if (a) startRun(mistakesIn(a));
}

// ============================ TEXTBOOK ============================
// The same 47 chapters the Android app reads, from the same files under data/theory/ and
// through the same block renderer (shared/book.js). Nothing here is fetched until the
// reader is opened — the index is ~40 KB and a chapter a few dozen, against a 3 MB bank.
//
// Both screens are async in a synchronous app: they paint "loading", then replace the
// screen when the JSON lands. A second call while the first is still in flight wins —
// hence the token — so clicking through chapters quickly cannot leave an older one
// painting over a newer.

// Bumped when the chapters are rebuilt: Pages caches data/ like any other file. Now at 2
// because map.json changed shape — an entry can carry a section after a '#', and a cached
// v1 map beside new code simply has no sections in it.
const BOOK_V = '2';
let bookIndex = null;      // the resolved index.json, once
let bookIndexLang = null;  // which locale bookIndex was resolved for — see bookLoadIndex
let bookQuery = '';        // the search box, remembered across renders
let bookOpen = null;       // the chapter on screen: { id, topic }
let bookToken = 0;

const bookBase = () => {
  const st = P();
  if (st) st.setBookVersion(BOOK_V);
  return st;
};

// index.json plus the lookup the screens want. Failure is not cached: a chapter list that
// failed once because the connection dropped must be retryable by opening it again. Keyed
// by LANG too — a language switch replays the current screen (see setLang) and must not
// keep showing whichever locale happened to load first.
async function bookLoadIndex() {
  if (bookIndex && bookIndexLang === LANG) return bookIndex;
  const st = bookBase();
  if (!st) throw new Error('store');
  const idx = await st.loadIndex(LANG);
  bookIndex = idx;
  bookIndexLang = LANG;
  return idx;
}

// "Read" is a mark weighed against a tombstone, not a key that happens to be there — the
// rule lives in shared/theory.js, and this resolves it once per render.
const bookRead = () => { const st = P(); return st ? st.readMap(st.book) : {}; };

function bookLoading(title) {
  app().innerHTML = `<h1>${esc(title)}</h1><div class="sub">${t('book_loading')}</div>`;
}

function bookFailed(err) {
  app().innerHTML = `<h1>${t('book_title')}</h1>
    <div class="exp muted">${t('book_failed', esc(err.message || String(err)))}</div>
    <div class="nav"><button class="btn" onclick="bookScreen()">${t('book_retry')}</button></div>`;
}

// ---- contents ----
const bookMatches = (tp, q) => !q
  || tp.title.toLowerCase().includes(q)
  || tp.lead.toLowerCase().includes(q)
  || tp.sections.some(s => s.title.toLowerCase().includes(q));

function bookScreen() {
  SCREEN = bookScreen;
  NAV_AT = 'book';
  narrow();
  const token = ++bookToken;
  bookLoading(t('book_title'));
  bookLoadIndex().then(index => {
    if (token !== bookToken) return;
    renderBookList(index);
  }).catch(err => { if (token === bookToken) bookFailed(err); });
}

function renderBookList(index) {
  const st = P();
  const read = bookRead();
  const cov = st.coverage(index, read);
  const q = bookQuery.trim().toLowerCase();
  const done = index.topics.filter(tp => read[tp.id]).length;
  const last = !q && st.book.last ? index.topics.find(tp => tp.id === st.book.last) : null;

  const groups = index.domains.map(d => {
    const list = d.topics.map(id => index.topics.find(tp => tp.id === id)).filter(tp => tp && bookMatches(tp, q));
    if (!list.length) return '';
    const here = list.filter(tp => read[tp.id]).length;
    // A search opens what it found; otherwise the fold remembers how it was left, and
    // the domain of the chapter being read opens on its own so «Продолжить» points into
    // something visible.
    const open = q || (st.book.open[d.id] ?? (last ? d.id === last.dom : false));
    return `<details class="hgrp bk-dom" data-dom="${attrEsc(d.id)}"${open ? ' open' : ''}>
      <summary><span class="hgrp-t">${esc(d.name)}</span><span class="hgrp-n">${here}/${d.topics.length}</span></summary>
      <div class="bk-rows">${list.map(tp => `
        <button class="bk-row${read[tp.id] ? ' read' : ''}" data-chapter="${attrEsc(tp.id)}">
          <span class="bk-mark">${read[tp.id] ? '✓' : ''}</span>
          <span class="bk-main">
            <span class="bk-row-title">${esc(tp.title)}</span>
            <span class="bk-row-note">${esc(tp.lead)}</span>
            <span class="bk-row-meta">${t('book_row_meta', tp.minutes, tp.qn)}</span>
          </span>
        </button>`).join('')}</div>
    </details>`;
  }).join('');

  app().innerHTML = `<h1>${t('book_title')}</h1>
    <div class="sub">${t('book_sub')}</div>

    <div class="sec">
      <div class="dbar">
        <div class="top"><span class="nm">${t('book_cov')}</span><span class="vl ${cov.pct >= 80 ? 'g' : cov.pct >= 40 ? 'a' : 'r'}">${cov.pct}%</span></div>
        <div class="track"><div class="fill ${cov.pct >= 80 ? 'g' : cov.pct >= 40 ? 'a' : ''}" style="width:${cov.pct}%"></div></div>
      </div>
      <div class="exp muted">${t('book_cov_foot', cov.done, cov.total, done, index.topics.length)}</div>
      ${last ? `<button class="btn" data-chapter="${attrEsc(last.id)}">${t('book_resume', esc(last.title))}</button>` : ''}
    </div>

    <input class="bk-search" type="search" placeholder="${t('book_search')}" value="${attrEsc(bookQuery)}" autocomplete="off">
    ${groups || `<div class="exp muted">${t('book_nothing')}</div>`}

    <div class="nav"><button class="btn" onclick="weakScreen()">${t('weak_title')}</button></div>`;

  wireBookRows();

  const box = document.querySelector('.bk-search');
  box.oninput = () => {
    const caret = box.selectionStart;
    bookQuery = box.value;
    renderBookList(index);
    const next = document.querySelector('.bk-search');
    next.focus();
    next.setSelectionRange(caret, caret);
  };
  // `toggle` does not bubble, hence the capture phase. Which domains are folded is part
  // of the synced textbook branch, so the phone opens on the same ones.
  app().addEventListener('toggle', e => {
    const box2 = e.target.closest?.('.bk-dom');
    if (!box2 || bookQuery.trim()) return;
    st.book.open[box2.dataset.dom] = box2.open;
    st.setBook({});
  }, true);
  renderSide();
  window.scrollTo(0, 0);
}

const wireBookRows = () =>
  document.querySelectorAll('[data-chapter]').forEach(b =>
    b.onclick = () => chapterScreen(b.dataset.chapter, b.dataset.sec || null));

// ---- one chapter ----
// `at` is a section id: arriving from a question opens the chapter where that question is
// answered rather than where this chapter was last left off.
function chapterScreen(id, at = null) {
  SCREEN = () => chapterScreen(id, at);
  narrow();
  const token = ++bookToken;
  const known = bookIndex && bookIndex.topics.find(tp => tp.id === id);
  bookLoading(known ? known.title : t('book_title'));
  const st = bookBase();
  Promise.all([st.loadTopic(id, LANG), bookLoadIndex()]).then(([tp, index]) => {
    if (token !== bookToken) return;
    bookOpen = { id, topic: tp };
    st.setBook({ last: id });
    renderChapter(tp, index, at);
  }).catch(err => { if (token === bookToken) bookFailed(err); });
}

function renderChapter(tp, index, at = null) {
  const st = P();
  const meta = index.topics.find(x => x.id === tp.id);
  const order = index.topics.map(x => x.id);
  const next = index.topics[order.indexOf(tp.id) + 1];
  const dom = index.domains.find(d => d.id === tp.dom);
  const read = !!bookRead()[tp.id];

  app().innerHTML = `${backRunHTML()}<article class="bk">
    <div class="bk-kicker">${esc(dom ? dom.name : tp.dom)}${tp.blueprint.length ? ` · ${t('book_blueprint', tp.blueprint.map(esc).join(', '))}` : ''}</div>
    <h1>${esc(tp.title)}</h1>
    <div class="sub">${esc(tp.lead)}</div>
    <div class="bk-meta">${t('book_row_meta', tp.minutes, meta ? meta.qn : tp.qs.length)}</div>

    <details class="exp-toggle bk-toc"><summary>${t('book_toc', tp.sections.length)}</summary>
      <ol>${tp.sections.map(s => `<li><a href="#sec-${attrEsc(s.id)}">${esc(s.title)}</a></li>`).join('')}</ol>
    </details>

    ${st.bodyMarkup(tp, LANG)}

    <div class="bk-foot">
      <div class="nav bk-actions">
        <button class="btn ${read ? '' : 'primary'}" data-act="read">${read ? t('book_read_done') : t('book_read_mark')}</button>
        ${tp.qs.length ? `<button class="btn" data-act="practice">${t('book_practice', Math.min(20, tp.qs.length))}</button>` : ''}
      </div>
      ${next ? `<button class="btn bk-next" data-chapter="${attrEsc(next.id)}">${t('book_next', esc(next.title))}</button>` : ''}
      <div class="nav"><button class="btn" onclick="bookScreen()">${t('book_back')}</button></div>
    </div>
  </article>`;

  wireBookRows();
  bindChecks(app());
  app().querySelector('[data-act="read"]').onclick = () => {
    // Marking read redraws the chapter, and a redraw that carries `at` would scroll back
    // up to the section this was opened at — often several screens above where the button
    // was just pressed. Hold the position: the tap was about the mark, not the place.
    const y = window.scrollY;
    st.markRead(tp.id, !st.isRead(tp.id));
    renderChapter(tp, index, at);
    window.scrollTo(0, y);
    renderSide();                       // the sidebar counts chapters read
  };
  const pr = app().querySelector('[data-act="practice"]');
  // The chapter's own questions, which is the whole point of a textbook inside a trainer:
  // read it, then answer exactly what the bank asks about it.
  if (pr) pr.onclick = () => startRun(shuffle(tp.qs.slice()).slice(0, 20));
  const target = at && app().querySelector(`#sec-${CSS.escape('' + at)}`);
  // Marked so the section that was asked for is visible as such — landing mid-chapter with
  // nothing highlighted reads as the page having scrolled by itself.
  if (target) { target.classList.add('bk-at'); target.scrollIntoView(); }
  else restoreBookScroll(tp.id);
}

// Self-check answers reveal on click. The markup comes from shared/book.js; this is the
// half that could not be shared, because the Android app delegates it from a screen root
// that outlives the render and this one does not.
function bindChecks(node) {
  node.querySelectorAll('[data-check]').forEach(head => head.onclick = () => {
    const open = head.getAttribute('aria-expanded') === 'true';
    head.setAttribute('aria-expanded', String(!open));
    head.nextElementSibling.hidden = open;
  });
}

// Where the chapter was left off, both ways. Saving is throttled to one write per second
// of scrolling — the branch is synced, and a store write per scroll event would be a
// network conversation about nothing.
function restoreBookScroll(id) {
  const y = (P()?.book?.pos || {})[id] || 0;
  if (y) requestAnimationFrame(() => window.scrollTo(0, y));
  else window.scrollTo(0, 0);
}

let bookScrollTimer = null;
addEventListener('scroll', () => {
  if (!bookOpen || SCREEN === null || bookScrollTimer) return;
  bookScrollTimer = setTimeout(() => {
    bookScrollTimer = null;
    // Only while a chapter is actually the screen: leaving one for the exam must not keep
    // rewriting its position with wherever that screen happens to be scrolled.
    if (bookOpen && document.querySelector('.bk')) P()?.setPos(bookOpen.id, window.scrollY);
  }, 1000);
}, { passive: true });

// Every reviewed question on screen gets the link to its chapter, once the map is here.
const wireChapterLinks = () =>
  document.querySelectorAll('[data-forq]').forEach(el =>
    bookChapterFor(el.dataset.forq.split(',').map(Number), el));

// Where in the book a question is answered — offered beside every graded answer, right or
// wrong, because the reason to open a chapter is as often "remind me why" as "I got that
// wrong". The map is 1395 short entries; it loads on the first answer that needs it.
//
// A chapter is three thousand words, so the pointer names one section of it when
// ccna-book/build.mjs could name one (about a third of the bank — see pickSection there).
// That is a signpost, not a promise: the section is derived, and when the build was not
// sure enough the link is the chapter alone, which is still the place to read.
let bookMap = null;
function bookChapterFor(qns, into) {
  const st = P();
  if (!st || bookMap === false) return;
  const list = Array.isArray(qns) ? qns : [qns];
  // Takes `index` as an argument rather than reading the module-level `bookIndex` — the
  // map is locale-independent and cached forever, but the index it looks titles up in is
  // not, and reading the closure here would show a stale-language title after a language
  // switch that happened between two calls (see bookLoadIndex).
  const show = (map, index) => {
    // One question points at its own chapter. A whole topic or domain points at the
    // chapter most of its questions land in — the bank is not sorted by subject, so the
    // first match is an arbitrary vote of one.
    const votes = new Map();
    for (const n of list) { const at = st.topicOf(map, n); if (at) votes.set(at, (votes.get(at) || 0) + 1); }
    if (!votes.size) return;
    const id = [...votes].sort((a, b) => b[1] - a[1])[0][0];
    const tp = index && index.topics.find(x => x.id === id);
    // A section is only named when this stands for one question. "Somewhere in this
    // chapter" is the honest answer for a subject that spans dozens of them.
    const secId = list.length === 1 ? st.sectionOf(map, list[0]) : null;
    const sec = secId && tp && tp.sections.find(x => x.id === secId);
    // The weak-spots screen puts this among its own pill buttons; everywhere else it is a
    // row of `.btn.sm` and matches them.
    const cls = into.parentElement && into.parentElement.classList.contains('acts') ? 'tiny lg' : 'btn sm';
    into.innerHTML = `<button class="${cls} bk-goto" data-chapter="${attrEsc(id)}"${sec ? ` data-sec="${attrEsc(secId)}"` : ''}>
      <span class="ch">${t('book_open_for_q', esc(tp ? tp.title : id))}</span>
      ${sec ? `<span class="sc">${t('book_open_at', esc(sec.title))}</span>` : ''}
    </button>`;
    wireBookRows();
  };
  if (bookMap && bookIndexLang === LANG) return show(bookMap, bookIndex);
  bookBase();
  Promise.all([st.loadMap(), bookLoadIndex()])
    .then(([map, index]) => { bookMap = map; show(map, index); })
    .catch(() => { bookMap = false; });   // no textbook on this deployment: say nothing
}

// ============================ SHARE FOR AI ============================
// Plain-text rendering of a question (+ the user's answer, if any) — meant to be
// pasted into an AI chat to get an independent explanation. Deliberately omits
// the app's own exp/why, so the AI reasons from scratch instead of echoing it.
function qToAIText(q, ans) {
  const L = [t('ai_q_label', q.n, domShort(q.dom)) + (q.disp ? t('ai_disputed') : ''), q.t];
  if (q.cli) L.push('', q.cli);
  else if (q.img) L.push('', t('ai_exhibit_note'));
  if (q.y === 'dd' && q.dd) {
    L.push('', t('ai_dd_type'), t('ai_dd_items', q.dd.items.join(', ')));
    q.dd.buckets.forEach(b => L.push(`${b.label}: ${b.correct.join(', ')}`));
    const placement = ans && ans.placement;
    if (placement) {
      L.push('', t('ai_dd_placement'));
      q.dd.items.forEach((t2, i) => {
        if (placement[i] === undefined) return;
        L.push(`  ${t2} → ${q.dd.buckets[placement[i]] ? q.dd.buckets[placement[i]].label : '?'}`);
      });
    }
  } else if (q.o) {
    L.push('');
    Object.keys(q.o).forEach(k => L.push(`${k}. ${q.o[k]}`));
    L.push('', t('ai_correct_answer', q.a.split('').join(', ')));
    if (ans && ans.given && ans.given.length) L.push(t('ai_my_answer', ans.given.join(', ')));
  }
  return L.join('\n');
}
function copyToClipboard(text, btn) {
  const done = () => {
    const old = btn.textContent; btn.textContent = t('copied_label'); btn.disabled = true;
    setTimeout(() => { btn.textContent = old; btn.disabled = false; }, 1500);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else fallbackCopy(text, done);
}
function fallbackCopy(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); done(); } catch (e) { alert(t('copy_failed')); }
  document.body.removeChild(ta);
}
function copyQuestion(btn, qn) {
  const q = DATA.find(x => x.n === qn); if (!q) return;
  copyToClipboard(qToAIText(q, S.ans && S.ans[qn]), btn);
}
// Bulk-export every wrong answer of the current review (practice or exam results)
// as one paste-ready block, separated by "---", with a short instruction header.
function copyMistakes(btn) {
  const bad = S.result.rev.filter(r => !r.good);
  if (!bad.length) return;
  const header = t('ai_mistakes_header', bad.length);
  const body = bad.map(r => qToAIText(r.q, S.ans[r.q.n])).join('\n\n---\n\n');
  copyToClipboard(header + body, btn);
}

// ============================ PRACTICE ============================
function renderPractice() {
  SCREEN = renderPractice;
  const q = S.qs[S.i]; if (!q) return home();
  const st = S.ans[q.n];
  let h = chrome(false, `<button class="btn sm chrome-exit" onclick="goScreen('home')">${t('nav_exit')}</button>
    ${chromeProgress(S.i, S.qs.length)}
    <span class="chrome-score"><span class="ok">${S.ok}</span>✓ <span class="bad">${S.done - S.ok}</span>✗</span>`)
    + `<div class="row">
    ${S.done ? `<button class="btn" onclick="finishPractice()">${t('practice_review_btn')}</button>` : ''}
    <div class="spacer"></div>
    <input class="qjump" id="qjump" type="number" placeholder="№" title="${t('jump_title')}"
      onkeydown="if(event.key==='Enter')pGoto()">
    <button class="btn sm" onclick="pGoto()">→</button></div>`;
  h += `<div class="card">${qBadges(q)}${exhibit(q)}${q.y === 'sim' ? '' : `<div class="qtext">${esc(q.t)}</div>`}${cliBlock(q.cli, q.n)}`;

  if (q.y === 'dd') {
    h += ddMarkup(q, st);
  } else if (q.y === 'sim') {
    h += `<div class="exp muted" style="margin:2px 0 6px">${t('sim_offline_note')}</div><div class="sim-body">${formatSimText(q.t)}</div>
      <details class="cli-wrap sim-answer"><summary>${t('sim_show_answer')}</summary><div class="sim-body">${formatSimAnswer(q.answer)}</div></details>`;
  } else {
    const multi = q.a.length > 1;
    h += `<div class="opts">`;
    for (const k of Object.keys(q.o)) {
      let cls = '';
      if (st) { if (q.a.includes(k)) cls = 'correct'; else if (st.given.includes(k)) cls = 'wrong'; }
      h += optHTML(k, q.o[k], { cls, disabled: !!st });
    }
    h += `</div>`;
    if (multi && !st) h += `<button class="btn primary" id="chk" style="margin-top:12px">${t('dd_check')}</button>`;
  }

  if (st) {
    h += `<div class="verdict ${st.ok ? 'ok' : 'bad'}">${st.ok ? t('verdict_correct') : t('verdict_incorrect')}${q.y !== 'dd' ? t('key_inline', q.a.split('').join(', ')) : ''}</div>`;
    h += rationale(q, st.given);
    // Right or wrong: the reason to open the chapter is as often "remind me why this is
    // the answer" as it is "I got that wrong". Filled in asynchronously by bookChapterFor,
    // or left empty on a deployment with no textbook.
    h += `<div class="row" style="margin-top:8px"><button class="btn sm" onclick="copyQuestion(this, ${q.n})">${t('copy_for_ai')}</button>
      <span class="bk-forq" data-forq="${q.n}"></span></div>`;
  }
  h += `<div class="nav"><button class="btn" onclick="pMove(-1)" ${S.i === 0 ? 'disabled' : ''}>${t('nav_prev')}</button>
    <button class="btn" onclick="pMove(1)">${S.i === S.qs.length - 1 ? t('nav_finish') : t('nav_next')}</button></div></div>`;
  app().innerHTML = h;
  if (st) wireChapterLinks();

  if (q.y === 'dd') { if (!st) wireDD(q, given => gradeDD(q, given)); }
  else if (q.y === 'sim') { /* reference card, nothing to wire or grade */ }
  else if (!st) {
    const multi = q.a.length > 1; let picked = new Set();
    document.querySelectorAll('.opt').forEach(b => b.onclick = () => {
      const k = b.dataset.k;
      if (multi) { picked.has(k) ? picked.delete(k) : picked.add(k); b.classList.toggle('sel'); }
      else grade(q, [k]);
    });
    const c = $('#chk'); if (c) c.onclick = () => { if (picked.size) grade(q, [...picked].sort()); };
  }
}
function grade(q, given) {
  const ok = given.join('') === q.a.split('').sort().join('');
  S.ans[q.n] = { given, ok }; S.done++; if (ok) S.ok++;
  recordAnswer(q.n, ok, S.srsRun ? 'srs' : 'practice');
  keepSession();
  renderPractice();
}
function gradeDD(q, placement) {
  const ok = ddCorrect(q, placement);
  S.ans[q.n] = { placement, ok }; S.done++; if (ok) S.ok++;
  recordAnswer(q.n, ok, S.srsRun ? 'srs' : 'practice');
  keepSession();
  renderPractice();
}
function pMove(d) {
  const n = S.i + d;
  if (n >= 0 && n < S.qs.length) { S.i = n; keepSession(); renderPractice(); }
  else if (n >= S.qs.length) { S.done ? finishPractice() : goScreen('home'); }
}
// Practice has no timer/scale like the exam — just tally what was answered so far
// (works mid-session via "Разбор ошибок" too, not only after the last question).
// `leave` is walking out through the sidebar rather than pressing finish: what was
// answered is still filed — a practice run has no all-or-nothing about it — but the
// results sheet is not what the click asked for, so it is not drawn.
function finishPractice() {
  const rev = S.qs.filter(q => S.ans[q.n] !== undefined).map(q => ({ q, good: S.ans[q.n].ok }));
  S.result = { rev, ok: rev.filter(r => r.good).length };
  S.reviewFilter = rev.some(r => !r.good) ? 'bad' : 'all';
  S.mode = 'pr-done';
  savePracticeAttempt(rev);
  if (P()) P().clearSession();
  renderSide();
  renderPracticeResults();
}
// The review sheet is reachable mid-run, so leaving it has to put the run back the way it
// was — a live 'pr', written down again, opened at the first question still unanswered.
function continuePractice() {
  S.mode = 'pr';
  S.i = S.qs.findIndex(q => S.ans[q.n] === undefined);
  if (S.i < 0) S.i = 0;
  keepSession();
  renderPractice();
}

function renderPracticeResults() {
  SCREEN = renderPracticeResults;
  const { rev, ok } = S.result;
  const nBad = rev.filter(r => !r.good).length, nOk = rev.length - nBad;
  const pct = rev.length ? Math.round(ok / rev.length * 100) : 0;
  let h = `<h1>${t('practice_results_title')}</h1>${replayNote()}<div class="card">
    <div class="center sub">${t('answered_pct', ok, rev.length, pct)}</div>
    <div class="nav center" style="justify-content:center"><button class="btn" onclick="home()">${t('nav_home')}</button>
      ${S.replay ? '' : `<button class="btn primary" onclick="continuePractice()">${t('continue_practice')}</button>`}</div>
  </div>
  <div class="sec"><h2>${t('review_title')}</h2><div class="row">
    <span class="chip ${S.reviewFilter === 'bad' ? 'on' : ''}" onclick="setReviewFilter('bad')">${t('filter_errors')}<span class="c">${nBad}</span></span>
    <span class="chip ${S.reviewFilter === 'all' ? 'on' : ''}" onclick="setReviewFilter('all')">${t('filter_all')}<span class="c">${rev.length}</span></span>
    <span class="chip ${S.reviewFilter === 'ok' ? 'on' : ''}" onclick="setReviewFilter('ok')">${t('filter_correct')}<span class="c">${nOk}</span></span>
    ${nBad ? `<div class="spacer"></div><button class="btn" onclick="copyMistakes(this)">${t('copy_mistakes')}</button>` : ''}
  </div></div>`;
  const shown = rev.filter(r => S.reviewFilter === 'all' || (S.reviewFilter === 'bad' ? !r.good : r.good));
  if (!shown.length) h += emptyReview();
  for (const { q, good } of shown) h += reviewItemHTML(q, good, S.ans[q.n]);
  app().innerHTML = h; window.scrollTo(0, 0);
  wireChapterLinks();
}

// Jump to any question by its bank number. If it isn't in the current practice set,
// it's inserted right after the current one so the session continues normally.
function pGoto() {
  const el = $('#qjump'); const n = parseInt(el.value, 10);
  if (!n) return;
  let i = S.qs.findIndex(q => q.n === n);
  if (i < 0) {
    const q = DATA.find(x => x.n === n);
    if (!q) { el.value = ''; el.placeholder = t('not_found_short'); return; }
    S.qs.splice(S.i + 1, 0, q); i = S.i + 1;
  }
  S.i = i; renderPractice();
}

// ============================ DRAG & DROP ENGINE ============================
// q.dd = { items:[str...], buckets:[{label,correct:[str...]}], note? }
function ddMarkup(q, st) {
  const dd = q.dd;
  const placed = st ? st.placement : {};   // itemIndex -> bucketIndex (or -1 bank)
  const inBank = i => !st ? (placed[i] === undefined) : false;
  const bankItems = dd.items.map((t, i) => ({ t, i })).filter(o => st ? false : placed[o.i] === undefined);
  let h = `<div class="dd-wrap">
    <div class="dd-col"><h3>${t('dd_elements')}</h3><div class="dd-bank" data-bucket="-1">`;
  if (!st) h += bankItems.map(o => ddItemHTML(o.t, o.i)).join('');
  h += `</div></div><div class="dd-col"><h3>${t('dd_categories')}</h3>`;
  dd.buckets.forEach((b, bi) => {
    h += `<div class="dd-bucket"><div class="bl">${esc(b.label)}</div><div class="dd-slot" data-bucket="${bi}">`;
    dd.items.forEach((t, i) => {
      if (st ? placed[i] === bi : false) {
        h += ddItemHTML(t, i, ddItemRight(q, placed, i) ? 'correct' : 'wrong');
      }
    });
    h += `</div></div>`;
  });
  h += `</div></div>`;
  if (dd.note && st) h += `<div class="dd-note">${esc(dd.note)}</div>`;
  if (!st) h += `<div class="dd-foot"><span class="dd-count" id="ddcount"></span>
    <button class="btn primary" id="ddchk" disabled>${t('dd_check')}</button></div>`;
  return h;
}
function ddItemHTML(t, i, cls = '') { return `<div class="dd-item ${cls}" draggable="${cls ? 'false' : 'true'}" data-i="${i}">${esc(t)}</div>`; }

function wireDD(q, done) {
  const placement = {};                     // itemIndex -> bucketIndex
  const needed = ddNeeded(q);               // slots to fill (may be < items: distractors)
  let dragEl = null;
  const chk = $('#ddchk');
  const count = $('#ddcount');
  const extra = q.dd.items.length - needed;
  // The button waits only for something to grade, never for a complete board. Questions
  // like #592 say so themselves — "Not all functions are used" — and gating on a full
  // board there means a learner who leaves an item out, rightly or wrongly, has no move
  // left. Marking is unchanged: ddCorrect still wants every item exactly where it belongs.
  const refresh = () => {
    const placed = Object.keys(placement).length;
    chk.disabled = placed === 0;
    count.innerHTML = t('dd_placed', ddFilledCount(q, placement), needed) +
      (extra > 0 ? ` · ${t('dd_extra', extra)}` : '');
  };

  document.querySelectorAll('.dd-item').forEach(el => {
    el.addEventListener('dragstart', e => { dragEl = el; el.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    el.addEventListener('dragend', () => { el.classList.remove('dragging'); dragEl = null; });
  });
  document.querySelectorAll('.dd-slot,.dd-bank').forEach(slot => {
    slot.addEventListener('dragover', e => { e.preventDefault(); slot.classList.add('over'); });
    slot.addEventListener('dragleave', () => slot.classList.remove('over'));
    slot.addEventListener('drop', e => {
      e.preventDefault(); slot.classList.remove('over');
      if (!dragEl) return;
      slot.appendChild(dragEl);
      const i = +dragEl.dataset.i, b = +slot.dataset.bucket;
      if (b === -1) delete placement[i]; else placement[i] = b;
      refresh();
    });
  });
  // tap fallback (mobile): click item then click a slot
  let sel = null;
  document.querySelectorAll('.dd-item').forEach(el => el.addEventListener('click', e => {
    e.stopPropagation();
    document.querySelectorAll('.dd-item').forEach(x => x.classList.remove('sel'));
    sel = el; el.classList.add('sel');
  }));
  document.querySelectorAll('.dd-slot,.dd-bank').forEach(slot => slot.addEventListener('click', () => {
    if (!sel) return; slot.appendChild(sel);
    const i = +sel.dataset.i, b = +slot.dataset.bucket;
    if (b === -1) delete placement[i]; else placement[i] = b;
    sel.classList.remove('sel'); sel = null; refresh();
  }));
  chk.onclick = () => done(placement);
  refresh();          // paint the counter before the first tap
}
// Correct iff every item sits where it belongs. Items that belong to no bucket
// (distractors) must stay in the bank (expected = null).
function ddExpected(q) {
  const exp = q.dd.items.map(() => null);
  q.dd.buckets.forEach((b, bi) => b.correct.forEach(t => {
    const i = q.dd.items.indexOf(t); if (i >= 0) exp[i] = bi;
  }));
  return exp;
}
function ddNeeded(q) { return q.dd.buckets.reduce((a, b) => a + b.correct.length, 0); }
// How much of the answer is actually built: a distractor sitting in a bucket fills a slot on
// screen but is not part of the answer, so it must not count as progress.
function ddFilledCount(q, placement) {
  const exp = ddExpected(q);
  return Object.keys(placement).filter(i => exp[i] != null).length;
}
// Most matching questions have named targets — "TCP" against "UDP" — and putting an item
// under the wrong name is simply wrong. A handful number their targets instead, or repeat one
// word across all of them, and say so in the stem: "drag the characteristics onto any
// position on the right". There the right items are right in any arrangement, and Cisco marks
// them on the set, not on the mapping.
//
// Ordering language is the exception to the exception: #383 numbers its targets too but asks
// for administrative distance "beginning with the lowest", and #665 says "onto the sequence
// on the right". Those numbers are a real order. The rule picks out 261, 592 and 1001 and
// leaves the other 156 alone. Kept in step with ccna-mobile/src/engine/grade.js.
const DD_ANY_POSITION = /any (of the )?positions?\b/i;
const DD_ORDERED = /\bsequence\b|\bin order\b|beginning with|lowest[\s\S]*highest|first[\s\S]*then/i;
function ddPositional(q) {
  const stem = q.t || '';
  if (DD_ORDERED.test(stem)) return false;
  const labels = q.dd.buckets.map(b => String(b.label).trim().toLowerCase());
  // A single target is trivially "all the same"; the interesting case is several of them.
  return (labels.length > 1 && new Set(labels).size === 1) || DD_ANY_POSITION.test(stem);
}
// Whether one placed item counts as right — any bucket will do when the targets are
// interchangeable, so the review does not cross out a correct item sitting in position 3.
function ddItemRight(q, placement, i) {
  if (placement[i] === undefined) return false;
  const exp = ddExpected(q);
  return ddPositional(q) ? exp[i] !== null : exp[i] === placement[i];
}
function ddCorrect(q, placement) {
  const exp = ddExpected(q);
  if (ddPositional(q)) {
    const per = q.dd.buckets.map(() => 0);
    for (const bi of Object.values(placement)) {
      if (per[bi] === undefined) return false;
      per[bi]++;
    }
    if (!q.dd.buckets.every((b, bi) => per[bi] === b.correct.length)) return false;
    const placed = Object.keys(placement).map(Number).sort((a, b) => a - b);
    const belongs = exp.map((v, i) => (v === null ? -1 : i)).filter(i => i >= 0).sort((a, b) => a - b);
    return placed.length === belongs.length && placed.every((v, k) => v === belongs[k]);
  }
  return q.dd.items.every((t, i) => (placement[i] === undefined ? null : placement[i]) === exp[i]);
}

// ============================ EXAM ============================
function beginExam(qs, mins, { preset = 'custom', weighted = false } = {}) {
  if (!qs.length) { alert(t('no_questions_filtered')); return; }
  if (!clearForNewRun()) return;
  narrow();
  const startedAt = Date.now();
  S = { mode: 'ex', qs, i: 0, ans: {}, flags: new Set(), end: mins ? startedAt + mins * 60000 : 0, tid: null,
    preset, weighted, startedAt, attemptId: attemptId(startedAt) };
  if (S.end) S.tid = setInterval(tick, 1000);
  keepSession();
  renderExam();
}
function tick() {
  const el = $('#timer'); if (!el) return;
  let ms = S.end - Date.now();
  if (ms <= 0) { clearInterval(S.tid); return finishExam(); }
  const m = Math.floor(ms / 60000), s = Math.floor(ms % 60000 / 1000);
  el.lastElementChild.textContent = `${m}:${String(s).padStart(2, '0')}`;
  el.classList.toggle('low', ms < 120000);
}
function renderExam() {
  SCREEN = renderExam;
  const q = S.qs[S.i], multi = q.y !== 'dd' && q.a.length > 1, cur = S.ans[q.n];
  let h = chrome(true, `<button class="chrome-x" onclick="goScreen('home')"
      title="${t('nav_exit')}" aria-label="${t('nav_exit')}">✕</button>
    ${chromeProgress(S.i, S.qs.length)}
    ${S.end ? `<span class="timer" id="timer">${CLOCK_ICON}<span>--:--</span></span>` : ''}`);
  h += `<div class="card">${qBadges(q)}${exhibit(q)}<div class="qtext">${esc(q.t)}</div>${cliBlock(q.cli, q.n)}`;

  if (q.y === 'dd') {
    h += ddExamMarkup(q, cur);
  } else {
    const sel = cur && cur.given ? cur.given : [];
    h += `<div class="opts">`;
    for (const k of Object.keys(q.o))
      h += optHTML(k, q.o[k], { cls: sel.includes(k) ? 'sel' : '' });
    h += `</div>`;
  }

  h += `<div class="nav">
    <button class="btn" onclick="eMove(-1)" ${S.i === 0 ? 'disabled' : ''}>${t('nav_prev')}</button>
    <button class="btn" onclick="eMove(1)" ${S.i === S.qs.length - 1 ? 'disabled' : ''}>${t('nav_next')}</button>
    <button class="btn" onclick="eFlag()">${S.flags.has(q.n) ? t('flag_on') : t('flag_off')}</button>
    <div class="spacer"></div><button class="btn primary" onclick="if(confirm('${t('finish_confirm')}'))finishExam()">${t('nav_finish_exam')}</button></div>`;
  h += `<div class="grid">` + S.qs.map((qq, idx) => {
    let c = 'cell'; if (idx === S.i) c += ' cur'; if (S.ans[qq.n] !== undefined) c += ' answered'; if (S.flags.has(qq.n)) c += ' flagged';
    return `<div class="${c}" onclick="eGo(${idx})">${idx + 1}</div>`;
  }).join('') + `</div>${gridLegend()}</div>`;
  app().innerHTML = h;
  if (S.end) tick();

  if (q.y === 'dd') {
    wireDDExam(q);
  } else {
    document.querySelectorAll('.opt').forEach(b => b.onclick = () => {
      const k = b.dataset.k; let a = new Set((S.ans[q.n] && S.ans[q.n].given) || []);
      if (multi) { a.has(k) ? a.delete(k) : a.add(k); } else a = new Set([k]);
      S.ans[q.n] = { given: [...a] }; keepSession(); renderExam();
    });
  }
}
// exam dd: same board but persists placement in S.ans[q.n].placement, no grading yet
function ddExamMarkup(q, cur) {
  const placed = (cur && cur.placement) || {};
  let h = `<div class="dd-wrap"><div class="dd-col"><h3>${t('dd_elements')}</h3><div class="dd-bank" data-bucket="-1">`;
  q.dd.items.forEach((t2, i) => { if (placed[i] === undefined) h += ddItemHTML(t2, i); });
  h += `</div></div><div class="dd-col"><h3>${t('dd_categories')}</h3>`;
  q.dd.buckets.forEach((b, bi) => {
    h += `<div class="dd-bucket"><div class="bl">${esc(b.label)}</div><div class="dd-slot" data-bucket="${bi}">`;
    q.dd.items.forEach((t2, i) => { if (placed[i] === bi) h += ddItemHTML(t2, i); });
    h += `</div></div>`;
  });
  return h + `</div></div>`;
}
function wireDDExam(q) {
  const placement = Object.assign({}, (S.ans[q.n] && S.ans[q.n].placement) || {});
  let dragEl = null, sel = null;
  const persist = () => { S.ans[q.n] = { placement: Object.assign({}, placement) }; keepSession(); };
  document.querySelectorAll('.dd-item').forEach(el => {
    el.addEventListener('dragstart', e => { dragEl = el; el.classList.add('dragging'); });
    el.addEventListener('dragend', () => { el.classList.remove('dragging'); dragEl = null; });
    el.addEventListener('click', e => { e.stopPropagation(); document.querySelectorAll('.dd-item').forEach(x => x.classList.remove('sel')); sel = el; el.classList.add('sel'); });
  });
  const handle = (slot, el) => { slot.appendChild(el); const i = +el.dataset.i, b = +slot.dataset.bucket; if (b === -1) delete placement[i]; else placement[i] = b; persist(); };
  document.querySelectorAll('.dd-slot,.dd-bank').forEach(slot => {
    slot.addEventListener('dragover', e => { e.preventDefault(); slot.classList.add('over'); });
    slot.addEventListener('dragleave', () => slot.classList.remove('over'));
    slot.addEventListener('drop', e => { e.preventDefault(); slot.classList.remove('over'); if (dragEl) handle(slot, dragEl); });
    slot.addEventListener('click', () => { if (sel) { const s = sel; sel = null; s.classList.remove('sel'); handle(slot, s); } });
  });
}
function eMove(d) { const n = S.i + d; if (n >= 0 && n < S.qs.length) { S.i = n; keepSession(); renderExam(); } }
function eGo(i) { S.i = i; keepSession(); renderExam(); }
function eFlag() { const n = S.qs[S.i].n; S.flags.has(n) ? S.flags.delete(n) : S.flags.add(n); keepSession(); renderExam(); }

function isCorrect(q, ans) {
  if (!ans) return false;
  if (q.y === 'dd') return ddCorrect(q, ans.placement || {});
  return (ans.given || []).slice().sort().join('') === q.a.split('').sort().join('');
}

function finishExam() {
  if (S.tid) clearInterval(S.tid);
  let ok = 0; const rev = [];
  const perDom = {}; META.domains.forEach(d => perDom[d.id] = { ok: 0, tot: 0 });
  for (const q of S.qs) {
    const good = isCorrect(q, S.ans[q.n]);
    if (good) ok++;
    perDom[q.dom].tot++; if (good) perDom[q.dom].ok++;
    rev.push({ q, good });
  }
  const pct = Math.round(ok / S.qs.length * 100);
  // Cisco scales 300..1000, pass 825. The map lives in shared/score.js so the phone and the
  // browser cannot report two different scores for the same answers.
  const scaled = toScaled(pct);
  const pass = scaled >= passMark();
  // Walked away from rather than taken? Then the number above is about the walking away,
  // and the screen says so instead of reporting it — see isAbandoned in shared/progress.js.
  // What is stored stays the raw tally; only the reading of it changes.
  const att = { qs: S.qs.map(q => q.n), answers: S.ans, total: S.qs.length, perDomain: perDom };
  const gone = dropped(att);
  S.result = { rev, perDom: gone ? perDomainIn(att) : perDom, ok, pct, scaled,
    pass: pass && !gone, total: S.qs.length, abandoned: gone, asked: askedIn(att) };
  saveExamAttempt(rev, perDom, ok, pct, scaled);
  // Filed, so it is no longer a run to come back to — the dashboard must not keep offering
  // a result that is already on screen.
  if (P()) P().clearSession();
  // The attempt is over and filed. Saying so matters beyond tidiness: leaving through the
  // sidebar asks "выйти без результата?" while a run is live, and there is no result left
  // to lose here — it is on the screen. Same mode a replayed exam opens in, so the arrow
  // keys cannot walk a finished attempt back into the exam either.
  S.mode = 'ex-done';
  renderSide();                         // the forecast, the queues and the history all moved
  // Default to "работа над ошибками" — jump straight to what needs fixing.
  S.reviewFilter = rev.some(r => !r.good) ? 'bad' : 'all';
  renderResults();
}
function setReviewFilter(mode) { S.reviewFilter = mode; (S.mode === 'pr-done' ? renderPracticeResults : renderResults)(); }
function renderResults() {
  SCREEN = renderResults;
  const { rev, perDom, ok, pct, scaled, pass } = S.result;
  const nBad = rev.filter(r => !r.good).length, nOk = rev.length - nBad;
  // A replayed attempt can have fewer questions on screen than it was scored on — the bank
  // may have dropped one since, or the file came from a phone on another build.
  const total = S.result.total || rev.length;

  const gone = !!S.result.abandoned;
  const asked = S.result.asked || 0;

  let h = `${replayNote()}<div class="score-panel">
    <div class="score-main">
      <span class="score-kicker">${t('results_kicker')}</span>
      <div class="score-line">${gone
        ? `<span class="big-score">${ok}/${asked}</span>`
        : `<span class="big-score">${scaled}</span><span class="score-of">${t('results_of')}</span>`}</div>
      <span class="scaled">${gone ? t('results_abandoned') : t('scale_note')}</span>
    </div>
    <div class="score-side">
      <span class="score-badge ${gone ? 'none' : pass ? 'pass' : 'fail'}">${gone
        ? t('hist_not_counted') : pass ? t('pass_badge') : t('fail_badge')}</span>
      <span class="score-pct">${gone
        ? t('hist_abandoned', asked, total)
        : t('correct_pct', ok, total, pct)}</span>
    </div>
  </div>
  <div class="nav"><button class="btn" onclick="home()">${t('nav_home')}</button>
    <div class="spacer"></div>
    <button class="btn primary" onclick="startFullExam()">${t('another_exam')}</button></div>
  <div class="sec"><h2>${t('by_domain')}</h2>`;
  META.domains.forEach(d => {
    const p = perDom[d.id]; if (!p || !p.tot) return;
    const pc = Math.round(p.ok / p.tot * 100);
    // The one place a bar's colour means something: it is about your result, not about how
    // much the domain weighs. 80 and 60 are the thresholds the spec names.
    const cls = pc >= 80 ? 'g' : pc >= 60 ? 'a' : 'r';
    h += `<div class="dbar"><div class="top"><span class="nm">${esc(domShort(d.id))}</span><span class="vl ${cls}">${p.ok} / ${p.tot} · ${pc}%</span></div>
      <div class="track"><div class="fill ${cls}" style="width:${pc}%"></div></div></div>`;
  });
  h += `</div><div class="sec"><h2>${t('review_title')}</h2><div class="row">
    <span class="chip ${S.reviewFilter === 'bad' ? 'on' : ''}" onclick="setReviewFilter('bad')">${t('filter_errors')}<span class="c">${nBad}</span></span>
    <span class="chip ${S.reviewFilter === 'all' ? 'on' : ''}" onclick="setReviewFilter('all')">${t('filter_all')}<span class="c">${rev.length}</span></span>
    <span class="chip ${S.reviewFilter === 'ok' ? 'on' : ''}" onclick="setReviewFilter('ok')">${t('filter_correct')}<span class="c">${nOk}</span></span>
    ${nBad ? `<div class="spacer"></div><button class="btn" onclick="copyMistakes(this)">${t('copy_mistakes')}</button>` : ''}
  </div>`;

  const shown = rev.filter(r => S.reviewFilter === 'all' || (S.reviewFilter === 'bad' ? !r.good : r.good));
  if (!shown.length) h += emptyReview();
  for (const { q, good } of shown) h += reviewItemHTML(q, good, S.ans[q.n]);
  app().innerHTML = h; window.scrollTo(0, 0);
  wireChapterLinks();
}
// Each filter deserves the sentence that fits it: "no errors" is good news, "no correct
// answers" is not, and "no questions" is neither.
function emptyReview() {
  const k = S.reviewFilter === 'bad' ? 'no_errors' : S.reviewFilter === 'ok' ? 'no_correct' : 'no_questions';
  return `<div class="exp muted">${t(k)}</div>`;
}

// Shared by exam results and practice results: one reviewed question, with a
// per-question "copy for AI" button alongside the built-in rationale.
function reviewItemHTML(q, good, ans) {
  let h = `<div class="review-item ${good ? 'ok' : 'bad'}">${qBadges(q, good ? `<span class="badge b-ok">${t('badge_ok')}</span>` : `<span class="badge b-disp">${t('badge_wrong')}</span>`)}${exhibit(q)}<div class="qtext">${esc(q.t)}</div>${cliBlock(q.cli, q.n)}`;
  if (q.y === 'dd') h += ddReview(q, ans);
  else h += rationale(q, (ans && ans.given) || []);
  // Filled in asynchronously, or left empty if this deployment has no textbook — see
  // bookChapterFor. An empty div rather than a spinner: a link that appears is a bonus,
  // a placeholder that never resolves is a defect.
  h += `<div class="row" style="margin-top:8px"><button class="btn sm" onclick="copyQuestion(this, ${q.n})">${t('copy_for_ai_short')}</button>
    <span class="bk-forq" data-forq="${q.n}"></span></div>`;
  return h + `</div>`;
}
function ddReview(q, ans) {
  const placed = (ans && ans.placement) || {};
  let h = `<div class="dd-wrap"><div class="dd-col"></div><div class="dd-col">`;
  q.dd.buckets.forEach((b, bi) => {
    h += `<div class="dd-bucket"><div class="bl">${esc(b.label)}</div><div class="dd-slot">`;
    // show correct answer set, mark what the user placed
    b.correct.forEach(t => {
      const i = q.dd.items.indexOf(t);
      const userRight = ddItemRight(q, placed, i);
      h += `<div class="dd-item ${userRight ? 'correct' : ''}">${esc(t)}${userRight ? ' ✓' : ''}</div>`;
    });
    h += `</div></div>`;
  });
  return h + `</div></div><div class="exp muted">${t('dd_no_why')}</div>`;
}

// Arrow keys move between questions in practice/exam, matching the on-screen ← пред / след → buttons.
// Ignored while typing in a field (e.g. the "перейти к вопросу" input) so cursor movement still works there.
document.addEventListener('keydown', e => {
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  const d = e.key === 'ArrowRight' ? 1 : -1;
  if (S.mode === 'pr') { e.preventDefault(); pMove(d); }
  else if (S.mode === 'ex') { e.preventDefault(); eMove(d); }
});

// expose for inline onclick
Object.assign(window, { home, cfg, tglDom, tglType, startFullExam, startCustomExam, startPractice, pMove, eMove, eGo, eFlag, finishExam, finishPractice, setReviewFilter, setLang, openMode, goScreen, segPick, browseSims, historyScreen, progressScreen, weakScreen, startSrsRun, startWrongRun, startTopicRun, startAttemptRun, startWeakRun, bookScreen, chapterScreen, openAttempt, exportProgress, importProgress, runSync, makeSyncKey, copySyncKey, forgetSyncKey });
// An automatic sync that changed the history redraws the screen showing it — and only
// that screen: pulling the ground out from under someone mid-question would be worse than
// a stale list.
addEventListener('ccna:synced', () => {
  renderSide();
  if (SCREEN === historyScreen || SCREEN === progressScreen || SCREEN === home || SCREEN === weakScreen) SCREEN();
});

window.addEventListener('DOMContentLoaded', route);
