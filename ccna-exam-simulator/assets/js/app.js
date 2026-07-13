/* CCNA 200-301 Exam Simulator — engine
   Data: data/questions.json (+ data/meta.json), exhibits under images/exhibits/ */
'use strict';

const $ = s => document.querySelector(s);
const app = () => document.getElementById('app');
const esc = s => { const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; };
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0;[a[i], a[j]] = [a[j], a[i]]; } return a; };
const ASSET_V = '5';                        // bump when topo SVGs / exhibits are regenerated (cache-bust)
const IMG = n => `images/exhibits/q${n}.jpg?v=${ASSET_V}`;

let DATA = [], META = null, DOM = {};      // DOM: id -> {name,weight}
let POOL = [];                             // scorable (txt/ex, + dd that are ready)
let S = {};                                // active session state

// ---- load ----
async function boot() {
  const [q, m] = await Promise.all([
    fetch('data/questions.json').then(r => r.json()),
    fetch('data/meta.json').then(r => r.json()),
  ]);
  DATA = q; META = m;
  META.domains.forEach(d => DOM[d.id] = d);
  POOL = DATA.filter(scorable);
  home();
}
function scorable(q) {
  if (q.y === 'txt' || q.y === 'ex') return q.a && q.a.length > 0;
  if (q.y === 'dd') return !!q.dd;          // only reconstructed drag-drops are scorable
  return false;
}
const domName = id => (DOM[id] ? DOM[id].name : id);
const domShort = id => domName(id).replace(/^\d+\.\d+\s+/, '');

// ============================ HOME ============================
function home() {
  const ex = DATA.filter(q => q.y === 'ex').length;
  const ddReady = META.dd_ready, ddTotal = META.dd_total;
  app().innerHTML = `
  <h1>CCNA 200-301</h1>
  <div class="sub">Симулятор экзамена · ${POOL.length} оцениваемых вопросов · ${ex} со схемами · ${META.with_exp} с пояснениями<br>
  Банк проверен онлайн (418/418 картиночных), ключ исправлен: #151, #986, #787, #1045, #1320.</div>

  <div class="card">
    <button class="btn big" onclick="startFullExam()">
      <span class="ico">🎯</span>
      <span class="tx"><b>Полный экзамен</b><span>100 вопросов · 120 мин · взвешено по 6 доменам Cisco · порог 825/1000 · отчёт по доменам</span></span>
    </button>
  </div>
  <div class="card">
    <button class="btn big pu" onclick="cfg('exam')">
      <span class="ico">⚙️</span>
      <span class="tx"><b>Свой экзамен</b><span>выбрать домены · число вопросов · таймер · разбор в конце</span></span>
    </button>
  </div>
  <div class="card">
    <button class="btn big gr" onclick="cfg('practice')">
      <span class="ico">📚</span>
      <span class="tx"><b>Тренировка</b><span>вопрос за вопросом · мгновенная проверка · пояснения</span></span>
    </button>
  </div>

  <h2>Домены экзамена</h2>
  <div class="card">
    ${META.domains.map(d => `
      <div class="dbar">
        <div class="top"><span class="nm">${esc(d.name)}</span><span class="vl">вес ${Math.round(d.weight*100)}% · ${d.count} вопр.</span></div>
        <div class="track"><div class="fill g" style="width:${Math.round(d.weight*100*2.2)}%"></div></div>
      </div>`).join('')}
  </div>
  <div class="sub">Drag-and-drop интерактивно: <b>${ddReady}/${ddTotal}</b> готово. Лаб-симуляции (${META.sim_total}) вынесены отдельно — <a href="#" onclick="browseSims();return false;">открыть справочно</a>.</div>
  <div class="foot">CCNA 200-301 Exam Simulator · банк 1401 вопрос · офлайн, без бэкенда</div>`;
}

// ============================ LAB SIMULATIONS (reference only) ============================
// Hands-on Cisco SIMULATION items from the dump. They can't run offline, so they're
// excluded from scoring/pools (scorable() returns false) and shown here for reference.

// The dump stores each sim as one run-on string:
//   "SIMULATION - Guidelines - <intro> • <ui-note> • ... Topology - Tasks - <intro> 1. .. 2. .."
// or a "Task 1 - ... • sub-point" variant. Turn it into readable HTML: collapse the
// boilerplate lab-UI guidelines, and lay the actual tasks out as headed lists.
function formatSimText(t) {
  let s = ' ' + String(t || '').replace(/\s+/g, ' ').trim() + ' ';
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
    if (ln === '@H@G') { closeList(); h += `<details class="cli-wrap sim-guide"><summary>Инструкции лаб-интерфейса</summary><div class="sim-guide-b">`; guide = true; }
    else if (ln === '@H@T') { closeGuide(); closeList(); h += `<div class="sim-h">Задачи</div>`; }
    else if (ln.startsWith('@T@')) { closeList(); h += `<div class="sim-task">${esc(ln.slice(3).trim())}</div>`; }
    else if (ln.startsWith('@B@')) { if (list !== 'ul') { closeList(); h += '<ul>'; list = 'ul'; } h += `<li>${esc(ln.slice(3).trim())}</li>`; }
    else if (ln.startsWith('@N@')) { if (list !== 'ol') { closeList(); h += '<ol>'; list = 'ol'; } h += `<li>${esc(ln.slice(3).replace(/^\d+\.\s*/, '').trim())}</li>`; }
    else { closeList(); h += `<p>${esc(ln)}</p>`; }
  }
  closeGuide(); closeList();
  return h || `<p>${esc(t)}</p>`;
}

function browseSims() {
  const sims = DATA.filter(q => q.y === 'sim');
  let h = `<div class="row"><button class="btn" onclick="home()">← назад</button></div>
    <h1>Лаб-симуляции</h1>
    <div class="sub">${sims.length} интерактивных лаб-заданий из дампа. Это hands-on симуляции Cisco (настройка на виртуальных устройствах) — офлайн в тренажёре не выполняются и не оцениваются. Ниже приведён текст задания для ознакомления.</div>`;
  sims.forEach(q => {
    h += `<div class="card">${qBadges(q, '<span class="badge b-ex">ЛАБ</span>')}
      <div class="exp muted" style="margin:6px 0">Лаб-симуляция · офлайн не выполняется</div>
      <div class="sim-body">${formatSimText(q.t)}</div>${cliBlock(q.cli)}</div>`;
  });
  app().innerHTML = h;
}

// ============================ CONFIG ============================
let selDoms = new Set();
let selTypes = new Set();
const QTYPES = [
  { id: 'txt', label: 'Текст' },
  { id: 'ex', label: 'Со схемой' },
  { id: 'dd', label: 'Drag & Drop' },
];
function domChips() {
  return `<div class="row">` + META.domains.map(d =>
    `<span class="chip ${selDoms.has(d.id) ? 'on' : ''}" data-d="${d.id}" onclick="tglDom('${d.id}')">${esc(domShort(d.id))}<span class="c">${d.count}</span></span>`
  ).join('') + `</div>`;
}
function typeChips(mode) {
  // Simulations aren't scorable, so they're only offered in practice (reference cards).
  const types = mode === 'practice' ? QTYPES.concat([{ id: 'sim', label: 'Симуляция' }]) : QTYPES;
  return `<div class="row">` + types.map(t => {
    const n = (t.id === 'sim' ? DATA : POOL).filter(q => q.y === t.id).length;
    return `<span class="chip ${selTypes.has(t.id) ? 'on' : ''}" data-ty="${t.id}" onclick="tglType('${t.id}')">${esc(t.label)}<span class="c">${n}</span></span>`;
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

function cfg(mode) {
  selDoms = new Set();
  selTypes = new Set();
  const isEx = mode === 'exam';
  app().innerHTML = `
  <h1>${isEx ? 'Свой экзамен' : 'Тренировка'}</h1>
  <div class="card">
    <div class="lbl">Домены (пусто = все)</div>${domChips()}
    <div class="lbl">Тип вопросов (пусто = все, включая Drag & Drop${isEx ? '' : '; симуляции — справочно, без оценки'})</div>${typeChips(mode)}
    <div class="lbl">Сколько вопросов</div>
    <div class="row">
      <select id="cnt">${(isEx ? [30, 60, 100] : [20, 50, 100, 0]).map(c => `<option value="${c}"${c === (isEx ? 60 : 20) ? ' selected' : ''}>${c || 'все'}</option>`).join('')}</select>
      ${isEx ? '' : '<label class="chip on" id="shf" onclick="this.classList.toggle(\'on\')">перемешать</label>'}
    </div>
    ${isEx ? `<div class="lbl">Время (минут)</div>
    <div class="row"><select id="min"><option>30</option><option selected>90</option><option>120</option><option value="0">без таймера</option></select></div>` : ''}
    <div class="nav"><button class="btn" onclick="home()">← назад</button><div class="spacer"></div>
      <button class="btn primary" onclick="${isEx ? 'startCustomExam()' : 'startPractice()'}">${isEx ? 'Старт →' : 'Начать →'}</button></div>
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
function startPractice() {
  let p = domPool(true);
  if ($('#shf').classList.contains('on')) p = shuffle(p);
  const c = +$('#cnt').value; if (c) p = p.slice(0, c);
  S = { mode: 'pr', qs: p, i: 0, ans: {}, ok: 0, done: 0 };
  renderPractice();
}

// ============================ QUESTION RENDER HELPERS ============================
function qBadges(q, extra = '') {
  const multi = q.y !== 'dd' && q.a.length > 1;
  let h = `<div class="badges"><span class="badge b-dom">${esc(domShort(q.dom))}</span><span class="qnum">Вопрос ${q.n}</span>`;
  if (q.y === 'ex') h += `<span class="badge b-ex">СХЕМА</span>`;
  if (q.y === 'dd') h += `<span class="badge b-dd">DRAG&DROP</span>`;
  if (multi) h += `<span class="badge b-multi">выбери ${q.a.length}</span>`;
  if (q.disp) h += `<span class="badge b-disp">спорный ключ</span>`;
  return h + extra + `</div>`;
}
function exhibit(q) {
  if (q.svg) return `<img class="eximg svgex" src="images/topo/${q.svg}?v=${ASSET_V}" alt="exhibit ${q.n}" loading="lazy">`;
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
  return `<details class="cli-wrap"><summary>Показать конфигурацию / вывод команды (${lines.length} стр.)</summary>${body}</details>`;
}

// Split an explanation into sentence-level parts so it reads as separate lines
// instead of one wall of text.
function expParts(t) {
  return String(t || '').trim()
    .split(/(?<=[.!?…])\s+(?=[«"“(A-ZА-Я0-9])/)
    .map(s => s.trim()).filter(Boolean);
}
// A readable explanation block: short ones render in full; long ones show a preview
// with a "развернуть полностью" toggle that opens the rest in a scrollable box.
function expHTML(text, wrapCls, wrapTag) {
  const parts = expParts(text);
  const P = p => `<p>${esc(p)}</p>`;
  const long = String(text).length > 240 && parts.length > 2;
  const inner = long
    ? `<div class="exp-head">${P(parts[0])}</div>` +
      `<details class="exp-toggle"><summary>развернуть полностью</summary>` +
      `<div class="exp-scroll">${parts.slice(1).map(P).join('')}</div></details>`
    : parts.map(P).join('');
  return `<${wrapTag} class="${wrapCls}">${inner}</${wrapTag}>`;
}
const expBlock = (text, cls = '') => text ? expHTML(text, `exp ${cls}`.trim(), 'div') : '';
const rtextBlock = text => text ? expHTML(text, 'rtext', 'div') : '';

// Per-option rationale: q.why = {A:"...", B:"..."} — why each option is right/wrong.
// Falls back to the older single-paragraph q.exp when q.why isn't available yet.
function rationale(q, given) {
  if (q.y === 'dd' || !q.o || !Object.keys(q.o).length) {
    return q.exp ? expBlock(q.exp, q.disp ? 'disp' : '') : (q.disp ? `<div class="exp disp">Спорный ключ — сверь по схеме.</div>` : '');
  }
  if (!q.why) {
    let fb = `<div class="verdict ok" style="font-size:13px;margin:6px 0">Ключ: ${q.a.split('').join(', ')}</div>`;
    fb += q.exp ? expBlock(q.exp, q.disp ? 'disp' : '') : (q.disp ? `<div class="exp disp">Спорный ключ — сверь по схеме.</div>` : '<div class="exp muted">Подробное пояснение пока не готово для этого вопроса.</div>');
    return fb;
  }
  // Which option blocks to show:
  //  • multi-answer question (choose 2-3): show every option in full;
  //  • single-answer, correct: only the correct option's block;
  //  • single-answer, wrong: only the wrongly-picked option's block.
  const multi = q.a.length > 1;
  const answeredOk = !!given && given.slice().sort().join('') === q.a.split('').sort().join('');
  let h = `<div class="rationale">`;
  for (const k of Object.keys(q.o)) {
    const ok = q.a.includes(k), picked = !!(given && given.includes(k));
    const show = multi ? true : (answeredOk ? ok : picked);
    if (!show) continue;
    let tag = ok ? '✓ верно' : '✗ неверно';
    if (picked && !ok) tag += ' · твой выбор';
    else if (multi && !picked && ok) tag += ' · пропущен';
    h += `<div class="ropt ${ok ? 'ok' : 'bad'}"><div class="rhead"><b>${k}.</b> ${esc(q.o[k])} <span class="tag">${tag}</span></div>`;
    if (q.why[k]) h += rtextBlock(q.why[k]);
    h += `</div>`;
  }
  h += `</div>`;
  if (q.disp) h += `<div class="exp disp">Спорный ключ — сверь по схеме.</div>`;
  return h;
}

// ============================ PRACTICE ============================
function renderPractice() {
  const q = S.qs[S.i]; if (!q) return home();
  const st = S.ans[q.n];
  let h = `<div class="row"><button class="btn" onclick="home()">✕ выход</button><div class="spacer"></div>
    <div class="stat">${S.i + 1}/${S.qs.length}</div>
    <div class="stat"><span class="ok">${S.ok}</span>✓ <span class="bad">${S.done - S.ok}</span>✗</div></div>`;
  h += `<div class="card">${qBadges(q)}${exhibit(q)}${q.y === 'sim' ? '' : `<div class="qtext">${esc(q.t)}</div>`}${cliBlock(q.cli)}`;

  if (q.y === 'dd') {
    h += ddMarkup(q, st);
  } else if (q.y === 'sim') {
    h += `<div class="exp muted" style="margin:2px 0 6px">Лаб-симуляция · офлайн не выполняется и не оценивается</div><div class="sim-body">${formatSimText(q.t)}</div>`;
  } else {
    const multi = q.a.length > 1;
    h += `<div class="opts">`;
    for (const k of Object.keys(q.o)) {
      let cls = 'opt', dis = '';
      if (st) { dis = 'disabled'; if (q.a.includes(k)) cls += ' correct'; else if (st.given.includes(k)) cls += ' wrong'; }
      h += `<button class="${cls}" data-k="${k}" ${dis}><span class="k">${k}</span><span>${esc(q.o[k])}</span></button>`;
    }
    h += `</div>`;
    if (multi && !st) h += `<button class="btn primary" id="chk" style="margin-top:12px">Проверить</button>`;
  }

  if (st) {
    h += `<div class="verdict ${st.ok ? 'ok' : 'bad'}">${st.ok ? '✓ Верно' : '✗ Неверно'}${q.y !== 'dd' ? ` · ключ: ${q.a.split('').join(', ')}` : ''}</div>`;
    h += rationale(q, st.given);
  }
  h += `<div class="nav"><button class="btn" onclick="pMove(-1)" ${S.i === 0 ? 'disabled' : ''}>← пред</button>
    <button class="btn" onclick="pMove(1)">${S.i === S.qs.length - 1 ? 'завершить' : 'след →'}</button></div></div>`;
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
function pMove(d) { const n = S.i + d; if (n >= 0 && n < S.qs.length) { S.i = n; renderPractice(); } else if (n >= S.qs.length) home(); }

// ============================ DRAG & DROP ENGINE ============================
// q.dd = { items:[str...], buckets:[{label,correct:[str...]}], note? }
function ddMarkup(q, st) {
  const dd = q.dd;
  const placed = st ? st.placement : {};   // itemIndex -> bucketIndex (or -1 bank)
  const inBank = i => !st ? (placed[i] === undefined) : false;
  const bankItems = dd.items.map((t, i) => ({ t, i })).filter(o => st ? false : placed[o.i] === undefined);
  let h = `<div class="dd-wrap">
    <div class="dd-col"><h3>Элементы</h3><div class="dd-bank" data-bucket="-1">`;
  if (!st) h += bankItems.map(o => ddItemHTML(o.t, o.i)).join('');
  h += `</div></div><div class="dd-col"><h3>Категории</h3>`;
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
  if (!st) h += `<button class="btn primary" id="ddchk" style="margin-top:6px" disabled>Проверить</button>`;
  return h;
}
function ddItemHTML(t, i, cls = '') { return `<div class="dd-item ${cls}" draggable="${cls ? 'false' : 'true'}" data-i="${i}">${esc(t)}</div>`; }

function wireDD(q, done) {
  const placement = {};                     // itemIndex -> bucketIndex
  const needed = ddNeeded(q);               // slots to fill (may be < items: distractors)
  let dragEl = null;
  const chk = $('#ddchk');
  const refresh = () => { chk.disabled = Object.keys(placement).length < needed; };

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
function ddCorrect(q, placement) {
  const exp = ddExpected(q);
  return q.dd.items.every((t, i) => (placement[i] === undefined ? null : placement[i]) === exp[i]);
}

// ============================ EXAM ============================
function beginExam(qs, mins) {
  if (!qs.length) { alert('Нет вопросов под выбранные фильтры.'); return; }
  S = { mode: 'ex', qs, i: 0, ans: {}, flags: new Set(), end: mins ? Date.now() + mins * 60000 : 0, tid: null };
  if (S.end) S.tid = setInterval(tick, 1000);
  renderExam();
}
function tick() {
  const el = $('#timer'); if (!el) return;
  let ms = S.end - Date.now();
  if (ms <= 0) { clearInterval(S.tid); return finishExam(); }
  const m = Math.floor(ms / 60000), s = Math.floor(ms % 60000 / 1000);
  el.textContent = `${m}:${String(s).padStart(2, '0')}`;
  el.classList.toggle('low', ms < 120000);
}
function renderExam() {
  const q = S.qs[S.i], multi = q.y !== 'dd' && q.a.length > 1, cur = S.ans[q.n];
  let h = `<div class="row"><button class="btn" onclick="if(confirm('Выйти без результата?'))home()">✕</button>
    <div class="spacer"></div>${S.end ? `<span class="timer" id="timer">--:--</span>` : ''}
    <div class="stat">${S.i + 1}/${S.qs.length}</div></div>`;
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
    <button class="btn" onclick="eMove(-1)" ${S.i === 0 ? 'disabled' : ''}>← пред</button>
    <button class="btn" onclick="eMove(1)" ${S.i === S.qs.length - 1 ? 'disabled' : ''}>след →</button>
    <button class="btn" onclick="eFlag()">${S.flags.has(q.n) ? '★ снять метку' : '☆ на потом'}</button>
    <div class="spacer"></div><button class="btn primary" onclick="if(confirm('Завершить экзамен?'))finishExam()">Завершить</button></div>`;
  h += `<div class="grid">` + S.qs.map((qq, idx) => {
    let c = 'cell'; if (idx === S.i) c += ' cur'; if (S.ans[qq.n] !== undefined) c += ' answered'; if (S.flags.has(qq.n)) c += ' flagged';
    return `<div class="${c}" onclick="eGo(${idx})">${idx + 1}</div>`;
  }).join('') + `</div></div>`;
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
  let h = `<div class="dd-wrap"><div class="dd-col"><h3>Элементы</h3><div class="dd-bank" data-bucket="-1">`;
  q.dd.items.forEach((t, i) => { if (placed[i] === undefined) h += ddItemHTML(t, i); });
  h += `</div></div><div class="dd-col"><h3>Категории</h3>`;
  q.dd.buckets.forEach((b, bi) => {
    h += `<div class="dd-bucket"><div class="bl">${esc(b.label)}</div><div class="dd-slot" data-bucket="${bi}">`;
    q.dd.items.forEach((t, i) => { if (placed[i] === bi) h += ddItemHTML(t, i); });
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

  let h = `<h1>Результат</h1><div class="card">
    <div class="big-score ${pass ? 'pass' : 'fail'}">${scaled}</div>
    <div class="scaled">шкала 300–1000 · порог 825</div>
    <div class="center sub">${ok} из ${S.qs.length} верно (${pct}%) · ${pass ? '<span class="pass">✓ проходной уровень</span>' : '<span class="fail">✗ ниже проходного</span>'}</div>
    <div class="nav center" style="justify-content:center"><button class="btn" onclick="home()">← домой</button>
      <button class="btn primary" onclick="startFullExam()">Ещё полный экзамен</button></div>
  </div>
  <h2>По доменам</h2><div class="card">`;
  META.domains.forEach(d => {
    const p = perDom[d.id]; if (!p.tot) return;
    const pc = Math.round(p.ok / p.tot * 100);
    const cls = pc >= 82 ? 'g' : pc >= 60 ? 'a' : 'r';
    h += `<div class="dbar"><div class="top"><span class="nm">${esc(domShort(d.id))}</span><span class="vl">${p.ok}/${p.tot} · ${pc}%</span></div>
      <div class="track"><div class="fill ${cls}" style="width:${pc}%"></div></div></div>`;
  });
  h += `</div><h2>Разбор</h2>`;
  for (const { q, good } of rev) {
    h += `<div class="review-item">${qBadges(q, good ? '<span class="badge b-ok">верно</span>' : '<span class="badge b-disp">ошибка</span>')}${exhibit(q)}<div class="qtext">${esc(q.t)}</div>${cliBlock(q.cli)}`;
    if (q.y === 'dd') {
      h += ddReview(q, S.ans[q.n]);
    } else {
      const given = (S.ans[q.n] && S.ans[q.n].given) || [];
      h += rationale(q, given);
    }
  }
  app().innerHTML = h; window.scrollTo(0, 0);
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

// expose for inline onclick
Object.assign(window, { home, cfg, tglDom, tglType, startFullExam, startCustomExam, startPractice, pMove, eMove, eGo, eFlag, finishExam });
window.addEventListener('DOMContentLoaded', boot);
