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

// ============================ I18N ============================
// UI-chrome translation. Default stays Russian (existing behaviour, untouched) —
// EN is an opt-in toggle (see .lang-switch in index.html), persisted in localStorage.
// The question bank's own explanations (`why`/`exp`) exist only in Russian (~1200
// entries) — translating them is out of scope, so EN mode simply hides that prose
// instead of mixing languages; see rationale() below.
// Resolved once, by the landing (stored choice → Accept-Language → Russian). Reading
// storage again here would disagree with it on a first visit from an English browser.
let LANG = NetPath.locale;

// The landing owns the locale — it is the same choice, offered in three places (its header,
// its How card, and the fixed switch above). This one delegates so all three stay in step.
function setLang(lang) { NetPath.setLocale(lang); }

// Applied by NetPath.setLocale; redraws the screen in place. Reloading would be simpler but
// costs the scroll position and, mid-attempt, would drop the session.
function applyLang(lang) {
  if (lang === LANG) return;
  LANG = lang;
  markLangSwitch();
  if (SCREEN) SCREEN();
}
const markLangSwitch = () =>
  document.querySelectorAll('.lang-opt')
    .forEach(el => el.classList.toggle('on', el.dataset.lang === LANG));

// How to redraw whatever is on screen after a language change. Every screen entry point
// records itself here; each one renders from state it does not own, so replaying it is safe.
let SCREEN = null;
const I18N = {
  ru: {
    boot_loading: 'Загрузка банка вопросов…',
    home_stats: '{0} оцениваемых вопросов · {1} со схемами · {2} с пояснениями',
    home_verified_note: 'Банк проверен онлайн (418/418 картиночных), ключ исправлен: #151, #986, #787, #1045, #1320.',
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
    exit_confirm: 'Выйти без результата?',
    finish_confirm: 'Завершить экзамен?',
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
    results_title: 'Результат',
    scale_note: 'шкала 300–1000 · порог 825',
    correct_pct: '{0} из {1} верно ({2}%)',
    pass_badge: '✓ проходной уровень',
    fail_badge: '✗ ниже проходного',
    another_exam: 'Ещё полный экзамен',
    by_domain: 'По доменам',
    badge_ok: 'верно',
    badge_wrong: 'ошибка',
  },
  en: {
    boot_loading: 'Loading the question bank…',
    home_stats: '{0} scored questions · {1} with exhibits · {2} with rationale',
    home_verified_note: 'Bank verified online (418/418 image questions), key fixed: #151, #986, #787, #1045, #1320.',
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
    exit_confirm: 'Exit without a result?',
    finish_confirm: 'Finish the exam?',
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
    results_title: 'Result',
    scale_note: 'scale 300–1000 · pass 825',
    correct_pct: '{0} of {1} correct ({2}%)',
    pass_badge: '✓ passing score',
    fail_badge: '✗ below passing',
    another_exam: 'Another full exam',
    by_domain: 'By Domain',
    badge_ok: 'correct',
    badge_wrong: 'wrong',
  },
};
const fmt = (s, ...vals) => s.replace(/\{(\d+)\}/g, (_, i) => vals[i] ?? '');
const t = (k, ...vals) => fmt((I18N[LANG] && I18N[LANG][k]) || I18N.ru[k] || k, ...vals);
markLangSwitch();   // the fixed switch reflects the locale the landing resolved
document.querySelectorAll('.lang-opt').forEach(el => el.classList.toggle('on', el.dataset.lang === LANG));

// ---- load ----
async function boot() {
  const [q, m] = await Promise.all([
    fetch(`data/questions.json?v=${DATA_V}`).then(r => r.json()),
    fetch(`data/meta.json?v=${DATA_V}`).then(r => r.json()),
  ]);
  DATA = q; META = m;
  META.domains.forEach(d => DOM[d.id] = d);
  POOL = DATA.filter(scorable);
}
function scorable(q) {
  if (q.y === 'txt' || q.y === 'ex') return q.a && q.a.length > 0;
  if (q.y === 'dd') return !!q.dd;          // only reconstructed drag-drops are scorable
  return false;
}
const domName = id => (DOM[id] ? DOM[id].name : id);
const domShort = id => domName(id).replace(/^\d+\.\d+\s+/, '');

// ============================ ENTRY ============================
// The landing is the site's first screen and has to paint immediately, so the 3 MB bank is
// fetched only when a mode is actually entered — and only once. A deep link
// (?mode=exam|custom|practice) skips the landing and opens that mode directly; the mode
// CTAs on the landing are ordinary links to those same URLs, so middle-click and
// "copy link address" behave the way they look.
let booting = null;
const ensureBooted = () => booting || (booting = boot());

const MODE_ENTRY = {
  exam: startFullExam,          // straight into the weighted 100-question attempt
  custom: () => cfg('exam'),    // the configure screen for a self-built exam
  practice: () => cfg('practice'),
};

function route() {
  const mode = new URLSearchParams(location.search).get('mode');
  if (mode && MODE_ENTRY[mode]) return openMode(mode);
  NetPath.showLanding();
}

function openMode(mode) {
  if (!MODE_ENTRY[mode]) return NetPath.showLanding();
  NetPath.hideLanding();
  app().innerHTML = `<h1>${esc(NetPath.CONFIG.brandName)}</h1><div class="sub">${t('boot_loading')}</div>`;
  ensureBooted().then(MODE_ENTRY[mode]);
}

// ============================ HOME ============================
function home() {
  SCREEN = home;
  const ex = DATA.filter(q => q.y === 'ex').length;
  const ddReady = META.dd_ready, ddTotal = META.dd_total;
  // Bars are read against the heaviest domain, so the widest one is full width. The old
  // fixed multiplier left every bar short of the track for no reason.
  const maxWeight = Math.max(...META.domains.map(d => d.weight));
  // "1.0 Network Fundamentals" — the blueprint number is set apart from the name.
  const domName = name => {
    const m = name.match(/^(\d+\.\d+)\s+(.*)$/);
    return m ? `<span class="dn">${esc(m[1])}</span> ${esc(m[2])}` : esc(name);
  };
  app().innerHTML = `
  <h1 class="home">CCNA 200-301</h1>
  <div class="sub">${t('home_stats', POOL.length, ex, META.with_exp)}<br>
  ${t('home_verified_note')}</div>

  <div class="modes">
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

  <div class="sec">
    <h2>${t('home_domains_title')}</h2>
    ${META.domains.map(d => `
      <div class="dbar">
        <div class="top"><span class="nm">${domName(d.name)}</span><span class="vl">${t('home_domain_weight', Math.round(d.weight*100), d.count)}</span></div>
        <div class="track"><div class="fill" style="width:${Math.round(d.weight / maxWeight * 100)}%"></div></div>
      </div>`).join('')}
  </div>
  <div class="sub">${t('home_dd_note', ddReady, ddTotal, META.sim_total)}<a class="link" href="#" onclick="browseSims();return false;">${t('home_sims_link')}</a>.</div>
  <div class="foot">${t('home_footer')}</div>`;
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
  SCREEN = browseSims;
  const sims = DATA.filter(q => q.y === 'sim');
  let h = `<div class="row"><button class="btn" onclick="home()">${t('nav_back')}</button></div>
    <h1>${t('sim_page_title')}</h1>
    <div class="sub">${t('sim_page_desc', sims.length)}</div>`;
  sims.forEach(q => {
    h += `<div class="card">${qBadges(q, `<span class="badge b-ex">${t('badge_sim')}</span>`)}
      <div class="exp muted" style="margin:6px 0">${t('sim_offline_short')}</div>
      ${exhibit(q)}
      <div class="sim-body">${formatSimText(q.t)}</div>${cliBlock(q.cli)}
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
    return `<span class="chip ${selTypes.has(ty.id) ? 'on' : ''}" data-ty="${ty.id}" onclick="tglType('${ty.id}')">${esc(t(ty.labelKey))}<span class="c">${n}</span></span>`;
  }).join('') + `</div>`;
}
function tglDom(id) { selDoms.has(id) ? selDoms.delete(id) : selDoms.add(id); const el = document.querySelector(`[data-d="${id}"]`); if (el) el.classList.toggle('on'); }
function tglType(id) { selTypes.has(id) ? selTypes.delete(id) : selTypes.add(id); const el = document.querySelector(`[data-ty="${id}"]`); if (el) el.classList.toggle('on'); }
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

// `keep` is set only when replaying the screen after a language change: the chips the
// user has already ticked are part of the screen, not something to reset under them.
function cfg(mode, keep) {
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
    if (was.cnt && $('#cnt')) $('#cnt').value = was.cnt;
    if (was.min && $('#min')) $('#min').value = was.min;
    if (was.jump && $('#qstart')) $('#qstart').value = was.jump;
    if ($('#shf')) $('#shf').classList.toggle('on', was.shuffled);
  };
  if (!keep) { selDoms = new Set(); selTypes = new Set(); }
  const isEx = mode === 'exam';
  app().innerHTML = `
  <h1>${isEx ? t('label_custom_exam') : t('label_practice')}</h1>
  <div class="card">
    <div class="lbl">${t('cfg_domains_label')}</div>${domChips()}
    <div class="lbl">${t('cfg_types_label')}${isEx ? '' : t('cfg_types_sim_note')})</div>${typeChips(mode)}
    <div class="lbl">${t('cfg_count_label')}</div>
    <div class="row">
      <select id="cnt">${(isEx ? [30, 60, 100] : [20, 50, 100, 0]).map(c => `<option value="${c}"${c === (isEx ? 60 : 20) ? ' selected' : ''}>${c || t('all_option')}</option>`).join('')}</select>
      ${isEx ? '' : `<label class="chip on" id="shf" onclick="this.classList.toggle('on')">${t('cfg_shuffle')}</label>`}
    </div>
    ${isEx ? '' : `<div class="lbl">${t('cfg_jump_label')}</div>
    <div class="row"><input class="qstart" id="qstart" type="number" min="1" max="${maxQN()}"
      placeholder="${t('cfg_jump_placeholder', maxQN())}"
      onkeydown="if(event.key==='Enter')startPractice()"></div>`}
    ${isEx ? `<div class="lbl">${t('cfg_time_label')}</div>
    <div class="row"><select id="min"><option>30</option><option selected>90</option><option>120</option><option value="0">${t('cfg_no_timer')}</option></select></div>` : ''}
    <div class="nav"><button class="btn" onclick="home()">${t('nav_back')}</button><div class="spacer"></div>
      <button class="btn primary" onclick="${isEx ? 'startCustomExam()' : 'startPractice()'}">${isEx ? t('cfg_start_exam') : t('cfg_start_practice')}</button></div>
  </div>`;
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
  beginExam(qs, 120);
}
function startCustomExam() {
  const n = +$('#cnt').value, mins = +$('#min').value;
  const qs = shuffle(domPool(false)).slice(0, n);
  beginExam(qs, mins);
}
const maxQN = () => DATA.reduce((m, q) => Math.max(m, q.n), 0);

function startPractice() {
  // Explicit question number wins: whole bank in order, opened at that question.
  const jn = $('#qstart') ? parseInt($('#qstart').value, 10) : 0;
  if (jn) {
    const all = DATA.slice().sort((a, b) => a.n - b.n);
    const i = all.findIndex(q => q.n === jn);
    if (i < 0) { $('#qstart').value = ''; $('#qstart').placeholder = t('practice_no_question', jn); return; }
    S = { mode: 'pr', qs: all, i, ans: {}, ok: 0, done: 0 };
    return renderPractice();
  }
  let p = domPool(true);
  if ($('#shf').classList.contains('on')) p = shuffle(p);
  const c = +$('#cnt').value; if (c) p = p.slice(0, c);
  S = { mode: 'pr', qs: p, i: 0, ans: {}, ok: 0, done: 0 };
  renderPractice();
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

// CLI/config/show-output text, extracted from the exhibit or embedded question text.
// Short snippets render as a plain code block; long ones collapse behind a toggle.
function cliBlock(text) {
  if (!text) return '';
  const lines = text.split('\n');
  const long = lines.length > 4 || text.length > 220;
  const body = `<pre class="cli">${esc(text)}</pre>`;
  if (!long) return `<div class="cli-wrap">${body}</div>`;
  return `<details class="cli-wrap"><summary>${t('cli_show', lines.length)}</summary>${body}</details>`;
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
// The bank's why/exp prose is Russian-only — never called when LANG==='en' (callers
// below gate on that), so its own "show explanation" label stays Russian too.
function expHTML(text, wrapCls, wrapTag) {
  const parts = expParts(text);
  const P = p => `<p>${esc(p)}</p>`;
  const long = String(text).length > 240 && parts.length > 2;
  const inner = long
    ? `<details class="exp-toggle"><summary>показать пояснение (${parts.length} предл.)</summary>` +
      `<div class="exp-scroll">${parts.map(P).join('')}</div></details>`
    : parts.map(P).join('');
  return `<${wrapTag} class="${wrapCls}">${inner}</${wrapTag}>`;
}
const expBlock = (text, cls = '') => text ? expHTML(text, `exp ${cls}`.trim(), 'div') : '';
const rtextBlock = text => text ? expHTML(text, 'rtext', 'div') : '';

// Per-option rationale: q.why = {A:"...", B:"..."} — why each option is right/wrong.
// Falls back to the older single-paragraph q.exp when q.why isn't available yet.
// In EN mode the Russian prose (why/exp) is deliberately suppressed — see the I18N
// comment at the top — only the structural verdict (✓/✗, the key) is shown.
function rationale(q, given) {
  const showProse = LANG === 'ru';
  if (q.y === 'dd' || !q.o || !Object.keys(q.o).length) {
    if (!showProse) return q.disp ? `<div class="exp disp">${t('disputed_note')}</div>` : '';
    return q.exp ? expBlock(q.exp, q.disp ? 'disp' : '') : (q.disp ? `<div class="exp disp">${t('disputed_note')}</div>` : '');
  }
  if (!q.why) {
    let fb = `<div class="verdict ok" style="font-size:13px;margin:6px 0">${t('key_label', q.a.split('').join(', '))}</div>`;
    if (showProse) fb += q.exp ? expBlock(q.exp, q.disp ? 'disp' : '') : (q.disp ? `<div class="exp disp">${t('disputed_note')}</div>` : `<div class="exp muted">${t('no_explanation_yet')}</div>`);
    else if (q.disp) fb += `<div class="exp disp">${t('disputed_note')}</div>`;
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
    if (showProse && q.why[k]) h += rtextBlock(q.why[k]);
    h += `</div>`;
  }
  h += `</div>`;
  if (q.disp) h += `<div class="exp disp">${t('disputed_note')}</div>`;
  return h;
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
  let h = chrome(false, `<button class="chrome-x" onclick="home()">✕</button>
    ${chromeProgress(S.i, S.qs.length)}
    <span class="chrome-score"><span class="ok">${S.ok}</span>✓ <span class="bad">${S.done - S.ok}</span>✗</span>`)
    + `<div class="row">
    ${S.done ? `<button class="btn" onclick="finishPractice()">${t('practice_review_btn')}</button>` : ''}
    <div class="spacer"></div>
    <input class="qjump" id="qjump" type="number" placeholder="№" title="${t('jump_title')}"
      onkeydown="if(event.key==='Enter')pGoto()">
    <button class="btn sm" onclick="pGoto()">→</button></div>`;
  h += `<div class="card">${qBadges(q)}${exhibit(q)}${q.y === 'sim' ? '' : `<div class="qtext">${esc(q.t)}</div>`}${cliBlock(q.cli)}`;

  if (q.y === 'dd') {
    h += ddMarkup(q, st);
  } else if (q.y === 'sim') {
    h += `<div class="exp muted" style="margin:2px 0 6px">${t('sim_offline_note')}</div><div class="sim-body">${formatSimText(q.t)}</div>
      <details class="cli-wrap sim-answer"><summary>${t('sim_show_answer')}</summary><div class="sim-body">${formatSimAnswer(q.answer)}</div></details>`;
  } else {
    const multi = q.a.length > 1;
    h += `<div class="opts">`;
    for (const k of Object.keys(q.o)) {
      let cls = 'opt', dis = '';
      if (st) { dis = 'disabled'; if (q.a.includes(k)) cls += ' correct'; else if (st.given.includes(k)) cls += ' wrong'; }
      h += `<button class="${cls}" data-k="${k}" ${dis}><span class="k">${k}</span><span>${esc(q.o[k])}</span></button>`;
    }
    h += `</div>`;
    if (multi && !st) h += `<button class="btn primary" id="chk" style="margin-top:12px">${t('dd_check')}</button>`;
  }

  if (st) {
    h += `<div class="verdict ${st.ok ? 'ok' : 'bad'}">${st.ok ? t('verdict_correct') : t('verdict_incorrect')}${q.y !== 'dd' ? t('key_inline', q.a.split('').join(', ')) : ''}</div>`;
    h += rationale(q, st.given);
    h += `<div class="row" style="margin-top:8px"><button class="btn sm" onclick="copyQuestion(this, ${q.n})">${t('copy_for_ai')}</button></div>`;
  }
  h += `<div class="nav"><button class="btn" onclick="pMove(-1)" ${S.i === 0 ? 'disabled' : ''}>${t('nav_prev')}</button>
    <button class="btn" onclick="pMove(1)">${S.i === S.qs.length - 1 ? t('nav_finish') : t('nav_next')}</button></div></div>`;
  app().innerHTML = h;

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
  S.ans[q.n] = { given, ok }; S.done++; if (ok) S.ok++; renderPractice();
}
function gradeDD(q, placement) {
  const ok = ddCorrect(q, placement);
  S.ans[q.n] = { placement, ok }; S.done++; if (ok) S.ok++; renderPractice();
}
function pMove(d) {
  const n = S.i + d;
  if (n >= 0 && n < S.qs.length) { S.i = n; renderPractice(); }
  else if (n >= S.qs.length) { S.done ? finishPractice() : home(); }
}
// Practice has no timer/scale like the exam — just tally what was answered so far
// (works mid-session via "Разбор ошибок" too, not only after the last question).
function finishPractice() {
  const rev = S.qs.filter(q => S.ans[q.n] !== undefined).map(q => ({ q, good: S.ans[q.n].ok }));
  S.result = { rev, ok: rev.filter(r => r.good).length };
  S.reviewFilter = rev.some(r => !r.good) ? 'bad' : 'all';
  S.mode = 'pr-done';
  renderPracticeResults();
}
function renderPracticeResults() {
  SCREEN = renderPracticeResults;
  const { rev, ok } = S.result;
  const nBad = rev.filter(r => !r.good).length, nOk = rev.length - nBad;
  const pct = rev.length ? Math.round(ok / rev.length * 100) : 0;
  let h = `<h1>${t('practice_results_title')}</h1><div class="card">
    <div class="center sub">${t('answered_pct', ok, rev.length, pct)}</div>
    <div class="nav center" style="justify-content:center"><button class="btn" onclick="home()">${t('nav_home')}</button>
      <button class="btn primary" onclick="S.i=S.qs.findIndex(q=>S.ans[q.n]===undefined);if(S.i<0)S.i=0;renderPractice()">${t('continue_practice')}</button></div>
  </div>
  <h2>${t('review_title')}</h2><div class="row" style="margin-bottom:14px">
    <span class="chip ${S.reviewFilter === 'bad' ? 'on' : ''}" onclick="setReviewFilter('bad')">${t('filter_errors')}<span class="c">${nBad}</span></span>
    <span class="chip ${S.reviewFilter === 'all' ? 'on' : ''}" onclick="setReviewFilter('all')">${t('filter_all')}<span class="c">${rev.length}</span></span>
    <span class="chip ${S.reviewFilter === 'ok' ? 'on' : ''}" onclick="setReviewFilter('ok')">${t('filter_correct')}<span class="c">${nOk}</span></span>
    ${nBad ? `<div class="spacer"></div><button class="btn" onclick="copyMistakes(this)">${t('copy_mistakes')}</button>` : ''}
  </div>`;
  const shown = rev.filter(r => S.reviewFilter === 'all' || (S.reviewFilter === 'bad' ? !r.good : r.good));
  if (!shown.length) h += `<div class="exp muted">${S.reviewFilter === 'bad' ? t('no_errors') : t('no_questions')}</div>`;
  for (const { q, good } of shown) h += reviewItemHTML(q, good, S.ans[q.n]);
  app().innerHTML = h; window.scrollTo(0, 0);
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
        const good = b.correct.includes(t);
        h += ddItemHTML(t, i, good ? 'correct' : 'wrong');
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
function ddCorrect(q, placement) {
  const exp = ddExpected(q);
  return q.dd.items.every((t, i) => (placement[i] === undefined ? null : placement[i]) === exp[i]);
}

// ============================ EXAM ============================
function beginExam(qs, mins) {
  if (!qs.length) { alert(t('no_questions_filtered')); return; }
  S = { mode: 'ex', qs, i: 0, ans: {}, flags: new Set(), end: mins ? Date.now() + mins * 60000 : 0, tid: null };
  if (S.end) S.tid = setInterval(tick, 1000);
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
  let h = chrome(true, `<button class="chrome-x" onclick="if(confirm('${t('exit_confirm')}'))home()">✕</button>
    ${chromeProgress(S.i, S.qs.length)}
    ${S.end ? `<span class="timer" id="timer">${CLOCK_ICON}<span>--:--</span></span>` : ''}`);
  h += `<div class="card">${qBadges(q)}${exhibit(q)}<div class="qtext">${esc(q.t)}</div>${cliBlock(q.cli)}`;

  if (q.y === 'dd') {
    h += ddExamMarkup(q, cur);
  } else {
    const sel = cur && cur.given ? cur.given : [];
    h += `<div class="opts">`;
    for (const k of Object.keys(q.o))
      h += `<button class="opt ${sel.includes(k) ? 'sel' : ''}" data-k="${k}"><span class="k">${k}</span><span>${esc(q.o[k])}</span></button>`;
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
      S.ans[q.n] = { given: [...a] }; renderExam();
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
  const persist = () => { S.ans[q.n] = { placement: Object.assign({}, placement) }; };
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
function eMove(d) { const n = S.i + d; if (n >= 0 && n < S.qs.length) { S.i = n; renderExam(); } }
function eGo(i) { S.i = i; renderExam(); }
function eFlag() { const n = S.qs[S.i].n; S.flags.has(n) ? S.flags.delete(n) : S.flags.add(n); renderExam(); }

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
  // Cisco scales 300..1000, pass 825. Approximate linear map from raw %.
  const scaled = Math.round(300 + (pct / 100) * 700);
  const pass = scaled >= 825;
  S.result = { rev, perDom, ok, pct, scaled, pass };
  // Default to "работа над ошибками" — jump straight to what needs fixing.
  S.reviewFilter = rev.some(r => !r.good) ? 'bad' : 'all';
  renderResults();
}
function setReviewFilter(mode) { S.reviewFilter = mode; (S.mode === 'pr-done' ? renderPracticeResults : renderResults)(); }
function renderResults() {
  SCREEN = renderResults;
  const { rev, perDom, ok, pct, scaled, pass } = S.result;
  const nBad = rev.filter(r => !r.good).length, nOk = rev.length - nBad;

  let h = `<h1>${t('results_title')}</h1><div class="card">
    <div class="big-score ${pass ? 'pass' : 'fail'}">${scaled}</div>
    <div class="scaled">${t('scale_note')}</div>
    <div class="center sub">${t('correct_pct', ok, rev.length, pct)} · ${pass ? `<span class="pass">${t('pass_badge')}</span>` : `<span class="fail">${t('fail_badge')}</span>`}</div>
    <div class="nav center" style="justify-content:center"><button class="btn" onclick="home()">${t('nav_home')}</button>
      <button class="btn primary" onclick="startFullExam()">${t('another_exam')}</button></div>
  </div>
  <h2>${t('by_domain')}</h2><div class="card">`;
  META.domains.forEach(d => {
    const p = perDom[d.id]; if (!p.tot) return;
    const pc = Math.round(p.ok / p.tot * 100);
    const cls = pc >= 82 ? 'g' : pc >= 60 ? 'a' : 'r';
    h += `<div class="dbar"><div class="top"><span class="nm">${esc(domShort(d.id))}</span><span class="vl">${p.ok}/${p.tot} · ${pc}%</span></div>
      <div class="track"><div class="fill ${cls}" style="width:${pc}%"></div></div></div>`;
  });
  h += `</div><h2>${t('review_title')}</h2><div class="row" style="margin-bottom:14px">
    <span class="chip ${S.reviewFilter === 'bad' ? 'on' : ''}" onclick="setReviewFilter('bad')">${t('filter_errors')}<span class="c">${nBad}</span></span>
    <span class="chip ${S.reviewFilter === 'all' ? 'on' : ''}" onclick="setReviewFilter('all')">${t('filter_all')}<span class="c">${rev.length}</span></span>
    <span class="chip ${S.reviewFilter === 'ok' ? 'on' : ''}" onclick="setReviewFilter('ok')">${t('filter_correct')}<span class="c">${nOk}</span></span>
    ${nBad ? `<div class="spacer"></div><button class="btn" onclick="copyMistakes(this)">${t('copy_mistakes')}</button>` : ''}
  </div>`;

  const shown = rev.filter(r => S.reviewFilter === 'all' || (S.reviewFilter === 'bad' ? !r.good : r.good));
  if (!shown.length) h += `<div class="exp muted">${S.reviewFilter === 'bad' ? t('no_errors') : t('no_correct')}</div>`;
  for (const { q, good } of shown) h += reviewItemHTML(q, good, S.ans[q.n]);
  app().innerHTML = h; window.scrollTo(0, 0);
}
// Shared by exam results and practice results: one reviewed question, with a
// per-question "copy for AI" button alongside the built-in rationale.
function reviewItemHTML(q, good, ans) {
  let h = `<div class="review-item ${good ? 'ok' : 'bad'}">${qBadges(q, good ? `<span class="badge b-ok">${t('badge_ok')}</span>` : `<span class="badge b-disp">${t('badge_wrong')}</span>`)}${exhibit(q)}<div class="qtext">${esc(q.t)}</div>${cliBlock(q.cli)}`;
  if (q.y === 'dd') h += ddReview(q, ans);
  else h += rationale(q, (ans && ans.given) || []);
  h += `<div class="row" style="margin-top:8px"><button class="btn sm" onclick="copyQuestion(this, ${q.n})">${t('copy_for_ai_short')}</button></div>`;
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
      const userRight = placed[i] === bi;
      h += `<div class="dd-item ${userRight ? 'correct' : ''}">${esc(t)}${userRight ? ' ✓' : ''}</div>`;
    });
    h += `</div></div>`;
  });
  return h + `</div></div>`;
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
Object.assign(window, { home, cfg, tglDom, tglType, startFullExam, startCustomExam, startPractice, pMove, eMove, eGo, eFlag, finishExam, setReviewFilter, setLang, applyLang, openMode });
window.addEventListener('DOMContentLoaded', route);
