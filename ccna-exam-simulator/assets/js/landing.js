/* NetPath landing — the site's first screen.
   Design source: design_handoff_netpath/ (README.md = spec, Site Landing.dc.html = mockup).

   It shares the page with the trainer engine (app.js) rather than living on a URL of its
   own: the trainer is a single-page app with no router, and the handoff keeps it that way.
   So this file renders into #landing, the engine renders into #trainer, and exactly one of
   the two is visible. The 3 MB question bank is not touched until a mode is entered.

   Everything the owner is expected to change lives in CONFIG below — brand name, links,
   domain weights, mode parameters. None of it should be typed into the markup. */
'use strict';

// One global, no shared top-level bindings with app.js — see the note by window.NetPath.
(function () {

// ============================ CONFIG ============================
const CONFIG = {
  // Working name. The owner replaces this after the exam; it must stay a single value.
  brandName: 'NetPath',

  // Releases page, not a file: CI keeps exactly one release and marks it latest.
  appUrl: 'https://github.com/NickelFace/ccna-trainer/releases/latest',

  // Blueprint domains. Bar widths are derived from weight (largest weight = full track),
  // never written as percentages by hand. Weights must match ccna-exam-simulator/data/
  // meta.json — tests/landing-config.test.mjs fails the build if they drift.
  domains: [
    // `short` is what fits on a chip; `label` is the blueprint name the Domains bars use.
    { id: 'IPC', label: 'IP Connectivity',              short: 'IP Connectivity', weight: 0.25, fill: 'ink',  accent: true  },
    { id: 'NF',  label: 'Network Fundamentals',         short: 'Fundamentals',    weight: 0.20, fill: 'ink',  accent: false },
    { id: 'NA',  label: 'Network Access',               short: 'Access',          weight: 0.20, fill: 'ink',  accent: false },
    { id: 'SEC', label: 'Security Fundamentals',        short: 'Security',        weight: 0.15, fill: 'teal', accent: false },
    { id: 'IPS', label: 'IP Services',                  short: 'IP Services',     weight: 0.10, fill: 'teal', accent: false },
    { id: 'AUT', label: 'Automation & Programmability', short: 'Automation',      weight: 0.10, fill: 'teal', accent: false },
  ],

  // The three trainer modes. `mode` is the query parameter the engine reads on load, so a
  // card CTA is a real link that survives middle-click and "copy link address".
  modes: [
    { mode: 'exam',     tone: 'feature', questions: 100, minutes: 120, pass: '825 / 1000' },
    { mode: 'custom',   tone: 'plain',   questions: 40,  minutes: 45  },
    { mode: 'practice', tone: 'plain'                                  },
  ],
};

const modeUrl = mode => `?mode=${mode}`;

// ============================ COPY ============================
// Russian is the source text and is reproduced verbatim from the handoff spec. The English
// dictionary is deliberately empty: the owner deferred the translation, and the headlines
// are wordplay that a machine pass would flatten. Missing keys fall through to Russian, so
// switching to EN today changes the heading typeface and nothing else.
const COPY = {
  ru: {
    nav_modes: 'Режимы', nav_domains: 'Домены', nav_how: 'Как устроено', nav_app: 'Приложение',
    nav_cta: 'Начать тест',

    hero_badge: 'Экзамен 200-301',
    hero_h1: 'Симулятор экзамена, а не ещё один банк вопросов',
    hero_lead: 'Вопросы взвешены по шести официальным доменам — как на настоящем экзамене. ' +
               'После попытки видно, какой домен вас топит.',
    hero_cta_primary: 'Выбрать режим',
    hero_cta_secondary: 'Приложение',
    hero_m1: 'доменов с весами', hero_m2: 'вопросов, 120 минут', hero_m3: 'порог из 1000',

    mock_label: 'Пример вопроса',
    mock_domain: 'IP Connectivity',
    mock_q: 'Сопоставьте состояние OSPF-соседства с событием, которое его вызывает.',
    mock_s1: '2-WAY', mock_s2: 'Обмен Hello завершён',
    mock_s3: 'EXSTART', mock_s4: 'Выбор master/slave',
    mock_hint: 'Перетащите ответ в поле', mock_next: 'Далее',

    modes_h2: 'Три режима тренажёра',
    modes_lead: 'От полной симуляции экзамена до разбора по одному вопросу. ' +
                'Или соберите свою попытку сами.',

    exam_tag: 'Экзамен', exam_title: 'Полный экзамен',
    exam_k_questions: 'Вопросов', exam_k_time: 'Время', exam_k_pass: 'Порог', exam_k_report: 'Отчёт',
    exam_v_time: '120 мин', exam_v_report: 'по доменам',
    exam_cta: 'Начать экзамен',

    custom_tag: 'Свой набор', custom_title: 'Свой экзамен',
    custom_k_domains: 'Домены', custom_k_questions: 'Вопросов', custom_k_timer: 'Таймер',
    custom_v_timer: '45 мин',
    custom_note: 'Разбор — в конце попытки, целиком.',
    custom_cta: 'Собрать набор',

    practice_tag: 'Без таймера', practice_title: 'Тренировка',
    practice_ok: 'Верно', practice_ok_v: 'мгновенно',
    practice_note: 'Пояснение к каждому ответу — почему верно и почему остальные нет.',
    practice_cta: 'Тренироваться',

    domains_h2: 'Веса, как в официальном плане',
    domains_lead: 'Каждая попытка собирается по этим пропорциям, поэтому тренировка ' +
                  'совпадает с реальной структурой экзамена.',

    how_h2: 'Три вещи, которые здесь работают иначе',
    how_1_t: 'Drag-and-drop как на экзамене',
    how_1_p: 'Сопоставления и порядок шагов, а не только выбор из четырёх вариантов.',
    how_2_t: 'Отчёт по доменам',
    how_2_p: 'Не общий процент, а срез по каждому домену — понятно, что учить завтра.',
    how_3_t: 'Русский и английский',
    how_3_p: 'Учитесь на русском, тренируйте формулировки на английском — одним переключателем.',

    app_kicker: 'Мобильное приложение',
    app_h2: 'Тот же тренажёр в телефоне',
    app_text: 'Часть того же проекта: те же домены, те же веса, тот же отчёт.',
    app_cta: 'Скачать APK',
    phone_kicker: 'Отчёт',
    phone_title: 'Домен: Network Access',
    phone_r1: 'Пробный экзамен',
    phone_r2: 'Отчёт по доменам',
    phone_r3: 'Язык вопросов', phone_r3_v: 'RU / EN',

    // Required in full, at 13px or larger. Do not shorten — see the handoff, B4.
    footer_disclaimer: 'Независимый тренажёр для подготовки к экзамену 200-301. ' +
                       'Не связан с Cisco Systems и не аффилирован с ней; ' +
                       'названия экзаменов и доменов приведены как справочные.',
    footer_modes: 'Режимы', footer_app: 'Приложение', footer_contacts: 'Контакты',
  },
  en: {},
};

// Stored choice first, then what the browser asks for, then Russian. There is no server to
// read Accept-Language from — the site is static — so navigator.languages is the client-side
// equivalent of the same header.
function initialLocale() {
  const saved = localStorage.getItem('ccna_lang');
  if (saved === 'ru' || saved === 'en') return saved;
  const asked = navigator.languages && navigator.languages.length
    ? navigator.languages : [navigator.language || ''];
  return asked.some(l => /^en\b/i.test(l)) ? 'en' : 'ru';
}
let locale = initialLocale();
const T = key => (COPY[locale][key] != null ? COPY[locale][key] : COPY.ru[key]);

// ============================ MARK ============================
// Same three bars as brand/generate.py, on the same 86-unit grid. Kept as data rather than
// a pasted <svg> string so the three colourways stay one shape.
const BARS = [[8, 58, 20, 20, 7], [33, 38, 20, 40, 7], [58, 12, 20, 66, 7]];
const PAINT = {
  light: ['#16181D', '#16181D', '#C9A24A'],
  dark:  ['#F7F4EE', '#F7F4EE', '#C9A24A'],
  muted: ['rgba(247,244,238,.3)', 'rgba(247,244,238,.3)', '#C9A24A'],
  mono:  ['#5C5850', '#5C5850', '#5C5850'],   // footer lockup, one grey with its wordmark
  solid: ['#16181D', '#16181D', '#16181D'],   // on the gold app tile: all three steps ink
};
const mark = (size, tone = 'light') =>
  `<svg class="np-mark" width="${size}" height="${size}" viewBox="0 0 86 86" aria-hidden="true">` +
  BARS.map(([x, y, w, h, r], i) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${PAINT[tone][i]}"/>`).join('') +
  '</svg>';

// ============================ SECTIONS ============================
// The header and How card 03 draw the same control. It is one piece of state, so both are
// rendered from here and both write through setLocale.
function langSwitch() {
  return `<div class="np-langs" role="group" aria-label="Language / Язык">` +
    ['ru', 'en'].map(l => `<button type="button" aria-pressed="${l === locale}"` +
      ` onclick="NetPath.setLocale('${l}')">${l.toUpperCase()}</button>`).join('') +
    `</div>`;
}

const NAV = [
  ['nav_modes', '#modes'], ['nav_domains', '#domains'],
  ['nav_how', '#how'], ['nav_app', '#app'],
];

function header() {
  return `
  <header class="np-header">
    <div class="np-shell">
      <a class="np-lockup" href="#top" aria-label="${CONFIG.brandName}">
        ${mark(26)}<span class="np-name">${CONFIG.brandName}</span>
      </a>
      <nav class="np-nav">${NAV.map(([k, href]) => `<a href="${href}">${T(k)}</a>`).join('')}</nav>
      <div class="np-header-right">
        ${langSwitch()}
        <a class="np-btn np-btn-ink" href="#modes">${T('nav_cta')}</a>
      </div>
    </div>
  </header>`;
}

function hero() {
  const metrics = [
    [CONFIG.domains.length, T('hero_m1')],
    [CONFIG.modes[0].questions, T('hero_m2')],
    [String(CONFIG.modes[0].pass).split('/')[0].trim(), T('hero_m3')],
  ];
  return `
  <section class="np-hero" id="top">
    <div class="np-shell">
      <div class="np-hero-copy">
        <span class="np-badge">${T('hero_badge')}</span>
        <h1>${T('hero_h1')}</h1>
        <p class="np-hero-lead">${T('hero_lead')}</p>
        <div class="np-hero-actions">
          <a class="np-btn np-btn-gold" href="#modes">${T('hero_cta_primary')}</a>
          <a class="np-btn np-btn-ghost" href="#app">${T('hero_cta_secondary')}</a>
        </div>
        <div class="np-metrics">
          ${metrics.map(([n, l]) => `<div class="np-metric"><b>${n}</b><span>${l}</span></div>`).join('')}
        </div>
      </div>
      ${questionMock()}
    </div>
  </section>`;
}

// An illustration of the trainer, not a component of it: aria-hidden and inert by design
// (handoff, "Что НЕ входит в объём").
function questionMock() {
  return `
  <div class="np-mock" aria-hidden="true">
    <div class="np-mock-head"><span class="l">${T('mock_label')}</span><span class="r">${locale.toUpperCase()}</span></div>
    <div class="np-mock-track"><i></i></div>
    <div class="np-mock-dom">${T('mock_domain')}</div>
    <p class="np-mock-q">${T('mock_q')}</p>
    <div class="np-mock-slots">
      <div class="np-slot empty">${T('mock_s1')}</div>
      <div class="np-slot filled">${T('mock_s2')}</div>
      <div class="np-slot empty">${T('mock_s3')}</div>
      <div class="np-slot lit">${T('mock_s4')}</div>
    </div>
    <div class="np-mock-foot"><span class="hint">${T('mock_hint')}</span><span class="next">${T('mock_next')}</span></div>
  </div>`;
}

function modes() {
  const [exam, custom, practice] = CONFIG.modes;
  const specs = [
    [T('exam_k_questions'), exam.questions, false],
    [T('exam_k_time'), T('exam_v_time'), false],
    [T('exam_k_pass'), exam.pass, true],
    [T('exam_k_report'), T('exam_v_report'), false],
  ];
  // Two of the six domains shown as picked, the rest collapsed into a counter.
  const picked = CONFIG.domains.slice(0, 1).concat(CONFIG.domains.filter(d => d.id === 'SEC'));
  const rest = CONFIG.domains.length - picked.length;

  return `
  <section class="np-modes" id="modes">
    <div class="np-shell">
      <div class="np-sec-head">
        <h2>${T('modes_h2')}</h2>
        <p class="np-sec-lead">${T('modes_lead')}</p>
      </div>
      <div class="np-mode-grid">

        <article class="np-mode feature">
          <div class="np-mode-top"><span class="np-tag gold">${T('exam_tag')}</span>${mark(26, 'muted')}</div>
          <h3>${T('exam_title')}</h3>
          <div class="np-specs">
            ${specs.map(([k, v, gold]) =>
              `<div><span class="k">${k}</span><span class="v${gold ? ' gold' : ''}">${v}</span></div>`).join('')}
          </div>
          <a class="np-btn np-btn-gold np-mode-cta" href="${modeUrl(exam.mode)}">${T('exam_cta')}</a>
        </article>

        <article class="np-mode">
          <div class="np-mode-top"><span class="np-tag teal">${T('custom_tag')}</span></div>
          <h3>${T('custom_title')}</h3>
          <div class="np-mode-body">
            <div class="np-field-group">
              <div class="np-field-label">${T('custom_k_domains')}</div>
              <div class="np-chips">
                ${picked.map(d => `<span class="np-chip on">${d.short}</span>`).join('')}
                <span class="np-chip off">+ ${rest}</span>
              </div>
            </div>
            <div class="np-fields">
              <div><div class="np-field-label">${T('custom_k_questions')}</div><div class="np-field-value">${custom.questions}</div></div>
              <div><div class="np-field-label">${T('custom_k_timer')}</div><div class="np-field-value">${T('custom_v_timer')}</div></div>
            </div>
            <p class="np-note">${T('custom_note')}</p>
          </div>
          <a class="np-btn np-btn-ink np-mode-cta" href="${modeUrl(custom.mode)}">${T('custom_cta')}</a>
        </article>

        <article class="np-mode">
          <div class="np-mode-top"><span class="np-tag mute">${T('practice_tag')}</span></div>
          <h3>${T('practice_title')}</h3>
          <div class="np-mode-body tight">
            <div class="np-plate ok"><span class="k">${T('practice_ok')}</span><span class="v">${T('practice_ok_v')}</span></div>
            <div class="np-plate warm">${T('practice_note')}</div>
            <div class="np-steps">
              ${['#2E7D6F', '#2E7D6F', '#C9A24A', 'rgba(22,24,29,.1)', 'rgba(22,24,29,.1)']
                .map(c => `<i style="background:${c}"></i>`).join('')}
            </div>
          </div>
          <a class="np-btn np-btn-outline np-mode-cta" href="${modeUrl(practice.mode)}">${T('practice_cta')}</a>
        </article>

      </div>
    </div>
  </section>`;
}

function domains() {
  const max = Math.max(...CONFIG.domains.map(d => d.weight));
  return `
  <section class="np-domains" id="domains">
    <div class="np-shell">
      <div class="np-domains-intro">
        <h2>${T('domains_h2')}</h2>
        <p class="np-sec-lead">${T('domains_lead')}</p>
      </div>
      <div class="np-bars">
        ${CONFIG.domains.map(d => `
        <div class="np-bar">
          <div class="np-bar-top">
            <span class="nm">${d.label}</span>
            <span class="pc${d.accent ? ' accent' : ''}">${Math.round(d.weight * 100)}%</span>
          </div>
          <div class="track"><i class="${d.fill}" style="width:${(d.weight / max * 100).toFixed(1)}%"></i></div>
        </div>`).join('')}
      </div>
    </div>
  </section>`;
}

// The visual at the foot of each card is a CSS primitive, not a screenshot — see the
// handoff on why the page explains itself with interface shapes instead of prose.
const HOW = [
  { n: '01', t: 'how_1_t', p: 'how_1_p', visual: `
    <div class="np-dd-demo"><i class="filled"></i><i class="empty"></i><i class="lit"></i></div>` },
  { n: '02', t: 'how_2_t', p: 'how_2_p', visual: `
    <div class="np-chart">${[[60, 'teal'], [100, 'ink'], [35, 'gold'], [78, 'ink'], [50, 'teal'], [88, 'ink']]
      .map(([h, c]) => `<i style="height:${h}%;background:var(--${c})"></i>`).join('')}</div>` },
  { n: '03', t: 'how_3_t', p: 'how_3_p', visual: null },   // filled in with the live switch
];

function how() {
  return `
  <section class="np-how" id="how">
    <div class="np-shell">
      <h2>${T('how_h2')}</h2>
      <div class="np-how-grid">
        ${HOW.map(c => `
        <article class="np-how-card">
          <span class="num">${c.n}</span>
          <h3>${T(c.t)}</h3>
          <p>${T(c.p)}</p>
          <div class="np-how-visual">${c.visual || langSwitch()}</div>
        </article>`).join('')}
      </div>
    </div>
  </section>`;
}

// Arrow-to-a-line, from the handoff's Assets section.
const DOWNLOAD_ICON =
  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
     stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
     <path d="M12 3v12m0 0l-5-5m5 5l5-5M4 20h16"/></svg>`;

function appSection() {
  return `
  <section class="np-app" id="app">
    <div class="np-shell">
      <div class="np-panel">
        <div class="np-app-copy">
          <div class="np-app-brand">
            <span class="np-app-tile">${mark(24, 'solid')}</span>
            <span>${T('app_kicker')}</span>
          </div>
          <h2>${T('app_h2')}</h2>
          <p class="np-app-text">${T('app_text')}</p>
          <!-- The releases page, not the file: CI republishes it, so no download attribute
               (that would name the page, not the build) and it opens in its own tab. -->
          <a class="np-btn np-btn-download" href="${CONFIG.appUrl}" target="_blank" rel="noopener">
            ${DOWNLOAD_ICON}${T('app_cta')}
          </a>
        </div>
        ${phoneMock()}
      </div>
    </div>
  </section>`;
}

function phoneMock() {
  const rows = [
    ['solid', T('phone_r1'), '→'],
    ['plain', T('phone_r2'), '→'],
    ['plain', T('phone_r3'), T('phone_r3_v')],
  ];
  const bars = [[40, 'rgba(22,24,29,.15)'], [62, 'rgba(22,24,29,.15)'], [55, 'rgba(22,24,29,.15)'],
                [80, 'var(--teal)'], [100, 'var(--gold)']];
  return `
  <div class="np-phone" aria-hidden="true">
    <div class="np-phone-screen">
      <div class="np-phone-status"><span>9:41</span><span>▮▮▮</span></div>
      <div class="np-phone-head">
        <span class="np-phone-kicker">${T('phone_kicker')}</span>
        <span class="np-phone-title">${T('phone_title')}</span>
      </div>
      <div class="np-phone-rows">
        ${rows.map(([cls, k, v]) =>
          `<div class="np-phone-row ${cls}"><span>${k}</span><span class="v">${v}</span></div>`).join('')}
      </div>
      <div class="np-phone-chart">
        ${bars.map(([h, c]) => `<i style="height:${h}%;background:${c}"></i>`).join('')}
      </div>
    </div>
  </div>`;
}

function footer() {
  const links = [['footer_modes', '#modes'], ['footer_app', '#app'], ['footer_contacts', '#top']];
  return `
  <footer class="np-footer">
    <div class="np-shell">
      <div class="np-lockup">${mark(20, 'mono')}<span class="np-name">${CONFIG.brandName}</span></div>
      <p class="np-disclaimer">${T('footer_disclaimer')}</p>
      <nav class="np-footer-links">
        ${links.map(([k, href]) => `<a href="${href}">${T(k)}</a>`).join('')}
      </nav>
    </div>
  </footer>`;
}

// ============================ MOUNT ============================
const root = () => document.getElementById('landing');

function render() {
  const el = root();
  el.dataset.locale = locale;
  // The heading face follows the language of the text on screen, not the language the
  // switch is set to. While the English dictionary is empty the copy stays Russian, and
  // Instrument Serif has no Cyrillic — binding the face to `locale` alone would drop those
  // headlines to a Georgia fallback. This flips to 'en' by itself once COPY.en is filled in.
  el.dataset.copy = Object.keys(COPY[locale]).length ? locale : 'ru';
  el.innerHTML = header() + hero() + modes() + domains() + how() + appSection() + footer();
}

function showLanding() {
  document.body.classList.add('np-on');
  root().hidden = false;
  document.getElementById('trainer').hidden = true;
  render();
}

function hideLanding() {
  document.body.classList.remove('np-on');
  root().hidden = true;
  document.getElementById('trainer').hidden = false;
}

// One locale for the whole page: the same key the trainer reads, so the two can never
// disagree. Re-renders in place instead of reloading — the scroll position is the point.
function setLocale(next) {
  if ((next !== 'ru' && next !== 'en') || next === locale) return;
  locale = next;
  localStorage.setItem('ccna_lang', next);
  // Both halves of the page redraw in place around a held scroll position — the landing is
  // long enough that losing it is the whole reason not to reload.
  const y = window.scrollY;
  if (!root().hidden) render();
  if (typeof applyLang === 'function') applyLang(next);
  window.scrollTo(0, y);
}

// A mode CTA is a real link to ?mode=… so middle-click, "open in new tab" and copying the
// address all do what they look like they do. A plain left click should not reload the page
// and re-fetch everything, though: swap the screen in place and rewrite the address to match.
document.addEventListener('click', e => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest && e.target.closest('a[href^="?mode="]');
  if (!a || typeof openMode !== 'function') return;
  const mode = new URLSearchParams(a.getAttribute('href')).get('mode');
  if (!mode) return;
  e.preventDefault();
  history.replaceState(null, '', a.getAttribute('href'));
  openMode(mode);
});

window.NetPath = { CONFIG, showLanding, hideLanding, setLocale, mark, get locale() { return locale; } };
})();
