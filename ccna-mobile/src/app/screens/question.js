// Question screen (spec 03) + answer review sheet (spec 04).
//
// One screen serves both modes, because they differ in only three places:
//   practice — tap selects, "Ответить" grades, the review sheet slides up;
//   exam     — tap is the answer and is stored at once, no feedback, timer in the header.
import { esc, h } from '../dom.js';
import { store } from '../store.js';
import { confirmDialog, closeDialogs } from '../dialog.js';
import { openSheet, closeSheet } from '../sheet.js';
import { openExhibit } from '../exhibit.js';
import { loadIndex, loadMap } from '../theory.js';
import { topic as topicScreen } from './topic.js';
import { isCorrect, ddNeeded } from '../../engine/grade.js';
import {
  currentQuestion, remainingMs, finishSession, gradesImmediately,
  firstUnansweredIndex, answeredCount,
} from '../session.js';
import {
  domShort, questionText, exhibitMarkup, cliMarkup, answerSummary, rationaleBlocks,
} from '../qmarkup.js';
import {
  syncMatch, resetMatch, matchBody, wireMatch, gradeMatch,
  canCheck, matchProgress, placedCount, filledCount, selectedItem, clearSelection, resetPlacement,
} from '../match.js';
import { keepScreenOn, releaseScreen } from '../wakelock.js';
import { result as resultScreen } from './result.js';
import { aiPrompt as aiPromptScreen } from './ai-prompt.js';

const FONT_STEPS = [1, 1.12, 1.25];
const LOW_TIME_MS = 120000;      // timer turns red and blinks under two minutes
const REVEAL_MS = 3000;          // a wrong answer gets this long on screen before the sheet interrupts

// ---- gesture / motion constants (see bindSwipe) ----
const SLOP = 10;                 // px of travel before the gesture commits to an axis
const COMMIT_RATIO = 0.22;       // of the pane width — a slow drag past this flips over
const COMMIT_V = 0.4;            // px/ms — a flick this fast flips over well short of the threshold
const FLICK_MIN = 30;            // px — but never from a distance this small; that is a tap that slipped
const EDGE_DRAG = 0.28;          // resistance factor when there is nothing to swipe to
const OUT_MS = 150;              // outgoing question — the incoming one is timed in CSS (.q-pane.in-*)
const EASE = 'cubic-bezier(.22,.9,.3,1)';

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let pending = new Set();         // practice-only: selected letters before "Ответить"
let pendingFor = null;           // the question those letters belong to
let timer = null;
let els = {};
let enterDir = 0;                // +1: the next question slides in from the right, -1: from the left
let shownPct = null;             // last painted progress width, so the bar can animate to the new one
let animating = false;           // a hand-off is in flight — ignore new gestures until it lands
// The review sheet is not up, or was put away — either by hand, or because navigating to
// this question is not the same as asking to see its rationale again (see closeReview).
// It carries the only way forward while it is up, so the question has to take that job
// back when it is not — see openReview / reviewFooter.
let reviewDismissed = false;
let leavingReview = false;       // the sheet is closing because the screen is leaving, not because the user closed it
// A wrong answer doesn't show the sheet at once — REVEAL_MS gives the colored options a
// moment on their own first. `revealed` is whether that wait is over (sheet shown at
// least once) for the current wrong-and-undismissed answer; `revealTimer` is the pending
// setTimeout id, cancelled the instant the question is left (see closeReview).
let revealed = false;
let revealTimer = null;
let settleToken = 0;             // see settle(): invalidates a pending inline-style cleanup

const fmtClock = ms => {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

const answerOf = (session, q) => session.answers[q.n];
const isWrong = (session, q) => answerOf(session, q)?.ok === false;

// True exactly while the sheet is covering the question — a wrong, undismissed answer
// that has already had its reveal. render() (body dimming) and footer() (hides the action
// bar) both call this instead of each keeping their own copy of the same decision.
const showsSheet = (s, q) => isWrong(s, q) && revealed && !reviewDismissed;

function cancelReveal() {
  if (revealTimer) { clearTimeout(revealTimer); revealTimer = null; }
}

// The router paints header and footer before the body, so the per-question scratch state
// has to be loaded from whoever asks first — otherwise the footer decides whether
// "Ответить" is enabled using the previous question's selection. Idempotent by design.
function syncPending(q, session) {
  if (q.y === 'dd') syncMatch(q, session);
  if (pendingFor === q.n) return;
  pending = new Set(answerOf(session, q)?.given || []);
  pendingFor = q.n;
}

// "Отложить" means two different things depending on where you are. Inside an exam it is
// the exam's own flag — scoped to this attempt and shown in the ☰ grid, like the web app's
// «★ на потом». Outside one it is a lasting bookmark on the question itself.
const isFlagged = (session, q) => session.mode === 'exam'
  ? session.flags.includes(q.n)
  : store.isBookmarked(q.n);

function toggleFlag(session, q) {
  if (session.mode !== 'exam') return store.toggleBookmark(q.n);
  const flags = session.flags.includes(q.n)
    ? session.flags.filter(n => n !== q.n)
    : [...session.flags, q.n];
  store.patchSession({ flags });
}

// ---------------------------------------------------------------- header
function header(ctx) {
  const s = store.session;
  if (!s) return null;
  const q = currentQuestion(s, ctx.bank);
  syncPending(q, s);
  // The clock owns the right-hand slot whenever there is one; on an untimed matching
  // question that slot shows how much of the board is filled instead (spec 05).
  const rightSlot = s.endsAt
    ? '<span class="mono q-timer" data-role="timer"></span>'
    : q.y === 'dd' ? `<span class="mono q-placed">${filledCount(q)} из ${ddNeeded(q)}</span>` : '<span></span>';

  // The header is rebuilt from scratch on every render, so the bar starts at the width it
  // last had and grows to the new one on the next frame — otherwise it would jump.
  const pct = ((s.i + 1) / s.qs.length) * 100;

  const node = h(`
    <div class="q-head">
      <button class="q-icon" data-act="close" type="button" aria-label="Закрыть">✕</button>
      <div class="q-meter">
        <div class="q-meter-row">
          <span class="mono">${s.i + 1} / ${s.qs.length}</span>
          ${rightSlot}
        </div>
        <div class="q-progress"><i style="width:${shownPct ?? pct}%"></i></div>
      </div>
      <button class="q-icon" data-act="grid" type="button" aria-label="Список вопросов">☰</button>
    </div>`);

  node.querySelector('[data-act="close"]').addEventListener('click', () => ctx.router.back());
  node.querySelector('[data-act="grid"]').addEventListener('click', () => openGrid(ctx));
  els.timer = node.querySelector('[data-role="timer"]');
  els.placed = node.querySelector('.q-placed');

  els.bar = node.querySelector('.q-progress i');
  els.barTo = pct;
  shownPct = pct;
  return node;
}

// ---------------------------------------------------------------- body
function render(ctx) {
  const { bank } = ctx;
  const s = store.session;
  const q = currentQuestion(s, bank);
  const given = answerOf(s, q);
  const graded = gradesImmediately(s) && given?.ok !== undefined;
  const multi = q.y !== 'dd' && q.a.length > 1;

  syncPending(q, s);

  const scale = store.profile.fontScale;

  // The pane — the node h() wraps everything in anyway — is what the swipe moves and fades.
  // .q-body stays a separate element because it carries its own opacity while the sheet
  // is up — which, since a correct answer never opens one, only ever happens on a mistake,
  // and even then only once REVEAL_MS has given the colored options their moment alone.
  const node = h(`
    <div class="q-body${showsSheet(s, q) ? ' graded' : ''}" style="--q-scale:${scale}">
      <div class="q-badges">
        <span class="badge-dom">${esc(domShort(bank, q.dom))}</span>
        <span class="mono q-num">№${q.n}</span>
        ${multi ? `<span class="badge-multi">выбери ${q.a.length}</span>` : ''}
        ${q.disp ? '<span class="badge-warn">спорный ключ</span>' : ''}
      </div>
      ${exhibitMarkup(q)}
      <div class="q-text">${esc(questionText(q))}</div>
      ${cliMarkup(q.cli)}
      ${q.y === 'dd' ? matchBody(q, graded) : optionsMarkup(q, s, given, graded)}
      <div class="q-tools">
        <button class="q-tool" data-act="bookmark" type="button">${isFlagged(s, q) ? '★ Отложен' : '☆ Отложить'}</button>
        <button class="q-tool" data-act="font" type="button">Aa Размер</button>
        <span class="q-hint mono">свайп → далее</span>
      </div>
    </div>`, 'div', 'q-pane');

  wireBody(node, ctx, q, s, graded);
  return node;
}

// Color says right or wrong; a tag says whose pick this was — the two can't collapse into
// one channel, because a multi-answer question can have one of each: a correct guess and
// a wrong one, side by side, plus a correct option the learner never touched at all.
function optionsMarkup(q, session, given, graded) {
  const selected = new Set(graded ? (given?.given || []) : pending);
  const rows = Object.keys(q.o).map(k => {
    const isCorrect = q.a.includes(k);
    const isPicked = selected.has(k);
    const classes = ['opt'];
    let tag = '';
    if (graded) {
      if (isCorrect && isPicked) { classes.push('correct', 'picked'); tag = '✓ твой'; }
      else if (isCorrect) { classes.push('correct'); tag = 'пропущен'; }
      else if (isPicked) { classes.push('wrong'); tag = '✗ твой'; }
      else classes.push('muted');
    } else if (isPicked) classes.push('sel');
    return `<button class="${classes.join(' ')}" data-k="${k}" type="button" ${graded ? 'disabled' : ''}>
        <span class="k mono">${k}</span><span class="mono opt-text">${esc(q.o[k])}</span>
        ${tag ? `<span class="opt-tag ${isCorrect ? 'ok' : 'err'}">${tag}</span>` : ''}
      </button>`;
  }).join('');
  return `<div class="opts">${rows}</div>`;
}

function wireBody(node, ctx, q, s, graded) {
  els.body = node.querySelector('.q-body');
  els.repaintMatch = null;

  node.querySelector('.q-exhibit')?.addEventListener('click', e =>
    openExhibit(e.currentTarget.src, `Схема к вопросу ${q.n}`));

  // The matching board repaints itself, for the same reason the options below do — and
  // more so: a full render() re-collapses the <details> holding the CLI output and, since
  // the question screen is a modal, drops the scroll back to the top on every single tap.
  // The .match node itself is kept, so the delegated listener wireMatch put on it lives on.
  if (q.y === 'dd' && !graded) {
    const board = node.querySelector('.match');
    els.repaintMatch = () => {
      board.replaceChildren(...h(matchBody(q, false)).firstElementChild.childNodes);
      if (els.placed) els.placed.textContent = `${filledCount(q)} из ${ddNeeded(q)}`;
      ctx.router.renderFooter();
    };
    wireMatch(board, q, s, els.repaintMatch);
  }

  // Tapping an option repaints the option row and the footer, never the whole body:
  // a full rebuild re-inserts the exhibit <img> and the screen visibly blinks on every tap.
  node.querySelectorAll('.opt').forEach(btn => btn.addEventListener('click', () => {
    const k = btn.dataset.k;
    const multi = q.a.length > 1;
    if (multi) { pending.has(k) ? pending.delete(k) : pending.add(k); } else { pending.clear(); pending.add(k); }
    pendingFor = q.n;
    // An exam banks the choice as you tap; anything that shows the rationale waits for
    // "Ответить", otherwise the sheet would fly up before a choice was made.
    if (!gradesImmediately(s)) store.answer(q.n, { given: [...pending].sort() });
    node.querySelectorAll('.opt').forEach(b => b.classList.toggle('sel', pending.has(b.dataset.k)));
    ctx.router.renderFooter();
  }));

  const bookmark = node.querySelector('[data-act="bookmark"]');
  bookmark.addEventListener('click', () => {
    toggleFlag(s, q);
    bookmark.textContent = isFlagged(s, q) ? '★ Отложен' : '☆ Отложить';
  });

  node.querySelector('[data-act="font"]').addEventListener('click', () => {
    const next = FONT_STEPS[(FONT_STEPS.indexOf(store.profile.fontScale) + 1) % FONT_STEPS.length];
    store.patchProfile({ fontScale: next });
    node.querySelector('.q-body').style.setProperty('--q-scale', next);
  });

  bindSwipe(node, ctx);

  // A fresh wrong answer gets REVEAL_MS on its own before the sheet interrupts. Anything
  // that already had its reveal — a dismissed sheet, or a correct answer — has nothing
  // left to schedule here; cancelReveal() on every way out of the question (closeReview)
  // is what stops this from ever firing on a question the user has since left.
  if (isWrong(s, q) && !reviewDismissed && !revealed) {
    revealTimer = setTimeout(() => {
      revealTimer = null;
      revealed = true;
      els.body?.classList.add('graded');
      ctx.router.renderFooter();
      openReview(ctx, q, s);
    }, REVEAL_MS);
  }
}

// Horizontal swipe moves between questions, the same job the ← / → arrows do on the web.
// The pane follows the finger the whole way, so the gesture is reversible: let go short of
// the threshold and it springs back, which is the only way to tell a swipe is even there.
//
// Vertical intent wins so the swipe never fights the scroll — the axis is decided once,
// after SLOP px of travel, and never revisited within the same touch. `touch-action: pan-y`
// on the pane leaves vertical scrolling to the browser, which is why every listener here
// can stay passive.
function bindSwipe(node, ctx, mover = node) {
  let x0 = 0, y0 = 0, dx = 0, v = 0, lastX = 0, lastT = 0, axis = null, live = false;

  const width = () => mover.offsetWidth || window.innerWidth;
  // Swiping right goes back; there is nothing behind the first question, and the drag
  // turns into a rubber band that says so. A session that ended under the finger — the
  // exam clock running out mid-drag — has nothing behind it either, and no `i` to read.
  const blocked = d => d > 0 && (store.session?.i ?? 0) === 0;

  const paint = d => {
    mover.style.transform = `translate3d(${d.toFixed(1)}px,0,0)`;
    mover.style.opacity = String(1 - Math.min(Math.abs(d) / width(), 0.5));
  };

  node.addEventListener('touchstart', e => {
    if (e.touches.length !== 1 || animating || !store.session) return;
    // A finger arriving mid-entrance takes over: the keyframes outrank the inline
    // transform the drag is about to write, so the animation has to go first.
    mover.classList.remove('in-next', 'in-prev');
    settleToken++;                 // a pending style cleanup must not land on this drag
    x0 = lastX = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
    lastT = e.timeStamp;
    dx = 0; v = 0; axis = null; live = true;
    mover.style.transition = 'none';
  }, { passive: true });

  node.addEventListener('touchmove', e => {
    if (!live || e.touches.length !== 1) return;
    const x = e.touches[0].clientX;
    const mx = x - x0, my = e.touches[0].clientY - y0;

    if (!axis) {
      if (Math.abs(mx) < SLOP && Math.abs(my) < SLOP) return;
      axis = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
      if (axis === 'y') { live = false; return; }
      mover.classList.add('dragging');
    }
    // Smoothed instantaneous velocity: a short flick has to count as much as a long drag.
    const dt = e.timeStamp - lastT;
    if (dt > 0) v = v * 0.7 + ((x - lastX) / dt) * 0.3;
    lastX = x; lastT = e.timeStamp;

    dx = blocked(mx) ? mx * EDGE_DRAG : mx;
    paint(dx);
  }, { passive: true });

  const release = () => {
    if (!live) return;
    live = false;
    mover.classList.remove('dragging');
    if (axis !== 'x') return;
    if (Math.abs(dx) > SLOP) swallowClick();   // the drag is not also a tap on what it started over
    // A flick only counts when it is still travelling the way the pane was dragged —
    // pulling back toward rest is how you cancel, however fast you let go.
    const flick = Math.abs(v) > COMMIT_V && Math.sign(v) === Math.sign(dx) && Math.abs(dx) > FLICK_MIN;
    const far = Math.abs(dx) > width() * COMMIT_RATIO || flick;
    // The session can end between touchstart and here; there is nowhere left to hand off
    // to, and the pane is about to be replaced by the result screen anyway.
    if (far && store.session && !blocked(dx)) handOff(mover, ctx, dx < 0 ? 1 : -1);
    else settle(mover);
  };
  node.addEventListener('touchend', release, { passive: true });
  node.addEventListener('touchcancel', release, { passive: true });
}

// A horizontal drag still ends in a synthesised click on whatever was under the finger,
// and on the review sheet that is the backdrop, whose click means "put me away". Eat the
// next click, capture-phase, so it never reaches the handler that would act on it.
function swallowClick() {
  const eat = e => { e.stopPropagation(); e.preventDefault(); };
  // The synthesised click lands within a frame or two of touchend, so the window stays
  // short: a real tap a moment later must not be eaten as well.
  document.addEventListener('click', eat, { capture: true, once: true });
  setTimeout(() => document.removeEventListener('click', eat, true), 150);
}

// Released short of the threshold: back to rest.
function settle(node) {
  node.style.transition = `transform 260ms ${EASE}, opacity 200ms ease-out`;
  node.style.transform = 'translate3d(0,0,0)';
  node.style.opacity = '1';
  // The token is what keeps this from wiping a drag that started in the meantime.
  const mine = ++settleToken;
  setTimeout(() => { if (mine === settleToken) node.style.cssText = ''; }, 300);
}

// Released past it: carry the pane the rest of the way out, then swap in the next question,
// which enters from the other side. Not a full-width slide — the pane leaves and arrives
// over a short distance while fading, so the two halves read as one movement.
function handOff(node, ctx, dir) {
  if (reduced()) return move(ctx, dir);
  animating = true;
  node.style.transition = `transform ${OUT_MS}ms ease-in, opacity ${OUT_MS}ms ease-in`;
  node.style.transform = `translate3d(${-dir * Math.round(node.offsetWidth * 0.32)}px,0,0)`;
  node.style.opacity = '0';
  // 150ms is long enough for the screen to have left underneath us — an exam timer running
  // out mid-swipe hands off to the result screen, and move() would then be working on a
  // session that is already over.
  setTimeout(() => {
    animating = false;
    if (store.session && ctx.router.current().screen === question) move(ctx, dir);
  }, OUT_MS);
}

// The entrance is a CSS animation rather than an inline transform flipped on the next
// frame: a WebView that goes to the background stops serving rAF, and a question left
// waiting for a frame that never comes would be an invisible screen. A keyframe whose
// resting state is simply "visible" cannot fail that way, and it drops the inline styles
// the outgoing pane left behind.
function animateIn(node) {
  const dir = enterDir;
  enterDir = 0;
  node.style.cssText = '';
  if (!dir || reduced()) return;
  node.classList.add(dir > 0 ? 'in-next' : 'in-prev');
  node.addEventListener('animationend', () => node.classList.remove('in-next', 'in-prev'), { once: true });
}

// ---------------------------------------------------------------- footer
function footer(ctx) {
  const s = store.session;
  if (!s) return null;
  const q = currentQuestion(s, ctx.bank);
  const graded = gradesImmediately(s) && answerOf(s, q)?.ok !== undefined;
  // While the review sheet is up it carries the action. Once it is put away — or never
  // came up at all, because the answer was right, or the reveal is still pending — the
  // question is on its own again and needs a bar of its own, without one the screen is a
  // dead end. During the REVEAL_MS wait this is exactly what lets the user jump ahead of
  // the timer instead of staring at an untouchable screen.
  if (graded) return showsSheet(s, q) ? null : reviewFooter(ctx, s, q);

  return q.y === 'dd' ? matchFooter(ctx, s, q) : choiceFooter(ctx, s, q);
}

// Shown only after the sheet was dismissed: a way back into the rationale, and the way on.
function reviewFooter(ctx, s, q) {
  const last = s.i === s.qs.length - 1;
  const node = h(`
    <div class="action-bar">
      <button class="btn" data-act="review" type="button">Разбор</button>
      <button class="btn primary grow" data-act="main" type="button">${last ? 'Завершить' : 'Следующий →'}</button>
    </div>`);

  node.querySelector('[data-act="review"]').addEventListener('click', () => {
    cancelReveal();                           // jumping ahead of the REVEAL_MS wait, if any
    revealed = true;
    reviewDismissed = false;
    els.body?.classList.add('graded');
    ctx.router.renderFooter();               // the sheet takes the action back
    openReview(ctx, q, s);
  });
  node.querySelector('[data-act="main"]').addEventListener('click', () => last ? tryFinish(ctx) : move(ctx, 1));
  return node;
}

function choiceFooter(ctx, s, q) {
  syncPending(q, s);
  const last = s.i === s.qs.length - 1;
  const checks = gradesImmediately(s);
  const canAct = !checks || pending.size > 0;
  const label = checks ? 'Ответить' : (last ? 'Завершить' : 'Дальше');

  const node = h(`
    <div class="action-bar">
      <button class="btn icon" data-act="prev" type="button" ${s.i === 0 ? 'disabled' : ''}>←</button>
      <button class="btn primary grow" data-act="main" type="button" ${canAct ? '' : 'disabled'}>${label}</button>
    </div>`);

  node.querySelector('[data-act="prev"]').addEventListener('click', () => move(ctx, -1));
  node.querySelector('[data-act="main"]').addEventListener('click', () => {
    if (gradesImmediately(s)) return gradeCurrent(ctx);
    if (last) return tryFinish(ctx);
    move(ctx, 1);
  });
  return node;
}

// Bank items run to full sentences in this bank ("It encapsulates LWAPP traffic between
// the access point and the WLC in EtherType 0xBBBB."), which would turn the one-line
// status into a four-line wall. The chip itself stays full text; only the echo is cut.
const shorten = (text, max = 34) =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;

// The matching board gets its own bar: a status line naming what is selected, then either
// Сброс/Проверить (practice) or the usual navigation (exam, where nothing is graded yet).
function matchFooter(ctx, s, q) {
  syncPending(q, s);
  const picked = selectedItem(q);
  const last = s.i === s.qs.length - 1;
  const canGrade = canCheck();

  const buttons = gradesImmediately(s)
    ? `<button class="btn" data-act="reset" type="button" ${placedCount() ? '' : 'disabled'}>Сброс</button>
       <button class="btn primary grow" data-act="check" type="button" ${canGrade ? '' : 'disabled'}>Проверить</button>`
    : `<button class="btn icon" data-act="prev" type="button" ${s.i === 0 ? 'disabled' : ''}>←</button>
       <button class="btn primary grow" data-act="main" type="button">${last ? 'Завершить' : 'Дальше'}</button>`;

  const { filled, needed, extra } = matchProgress(q);

  const node = h(`
    <div class="match-bar">
      ${picked ? `
        <div class="match-status">
          <span><b class="mono">${esc(shorten(picked))}</b> выбран — выбери категорию</span>
          <button class="match-cancel" data-act="cancel" type="button">Отменить</button>
        </div>`
      : gradesImmediately(s) ? `
        <div class="match-status">
          <span>Разложено <b>${filled}</b> из <b>${needed}</b></span>
          ${extra > 0 ? `<span class="match-extra">${extra === 1 ? 'один элемент лишний' : `лишних элементов: ${extra}`}</span>` : ''}
        </div>` : ''}
      <div class="action-bar">${buttons}</div>
    </div>`);

  const repaint = () => (els.repaintMatch || ctx.router.render.bind(ctx.router))();
  node.querySelector('[data-act="cancel"]')?.addEventListener('click', () => clearSelection(repaint));
  node.querySelector('[data-act="reset"]')?.addEventListener('click', () => resetPlacement(q, s, repaint));
  node.querySelector('[data-act="check"]')?.addEventListener('click', () => {
    gradeMatch(q, s);
    reviewDismissed = false;          // just graded — this is the ask, wireBody may open it
    revealed = false;
    ctx.router.render();
  });
  node.querySelector('[data-act="prev"]')?.addEventListener('click', () => move(ctx, -1));
  node.querySelector('[data-act="main"]')?.addEventListener('click', () => last ? tryFinish(ctx) : move(ctx, 1));
  return node;
}

// ---------------------------------------------------------------- actions
function gradeCurrent(ctx) {
  const s = store.session;
  const q = currentQuestion(s, ctx.bank);
  const given = [...pending].sort();
  const ok = isCorrect(q, { given });
  store.answer(q.n, { given, ok });
  store.recordAnswer(q.n, ok, s.mode);
  pendingFor = null;
  reviewDismissed = false;
  revealed = false;
  ctx.router.render();
}

// `delta` doubles as the direction the next question enters from, so tapping ← / Дальше
// animates exactly like the matching swipe does.
function move(ctx, delta) {
  closeReview();
  const s = store.session;
  const next = s.i + delta;
  if (next < 0) return;
  if (next >= s.qs.length) return tryFinish(ctx);
  store.patchSession({ i: next });
  pendingFor = null;
  enterDir = delta > 0 ? 1 : -1;
  ctx.router.render();
}

// Everything the user can press to end a run goes through here; only the expiring timer
// calls finish() outright, because an exam clock that hits zero is not up for discussion.
//
// Skipped questions score as wrong, so ending on top of them silently would quietly cost
// points. It stays the user's call — some skips are deliberate — but it is made a call
// instead of an accident: named count, a way straight back to the first one, and an
// outside tap that changes nothing.
function tryFinish(ctx) {
  const s = store.session;
  const gap = firstUnansweredIndex(s);
  if (gap === -1) return finish(ctx);

  const left = s.qs.length - answeredCount(s);
  confirmDialog({
    title: 'Остались вопросы без ответа',
    text: `Пропущено: ${left} из ${s.qs.length}. Без ответа они засчитаются как неверные.`,
    ok: `К вопросу ${gap + 1}`,
    cancel: 'Всё равно завершить',
  }).then(answer => {
    if (answer === null) return;                 // dismissed: stay where we are
    if (answer === false) return finish(ctx);
    closeReview();
    enterDir = gap > s.i ? 1 : -1;
    store.patchSession({ i: gap });
    pendingFor = null;
    ctx.router.render();
  });
}

// A run is scored once. The exam clock keeps ticking behind a dialog, so the timer can get
// here while «Остались вопросы без ответа» or «Выйти из экзамена?» is still up; those
// dialogs come down with it, and whatever the user taps a moment later finds a session
// that is already over and stops here rather than scoring it a second time.
function finish(ctx) {
  if (!store.session) return;
  closeDialogs();
  closeReview();
  stopTimer();
  const { attempt, result } = finishSession(store.session, ctx.bank);
  store.flush();
  ctx.router.replace(resultScreen, { attempt, result });
}

// Everything answered wrong so far in this session, ready for the prompt builder.
const sessionMistakes = (session, bank) => session.qs
  .map(qn => ({ q: bank.byN.get(qn), answer: session.answers[qn] }))
  .filter(({ q, answer }) => q && answer !== undefined && !isCorrect(q, answer));

// ---------------------------------------------------------------- review sheet
function openReview(ctx, q, s) {
  const given = answerOf(s, q);
  // On the last question this button ends the run, so it has to say so — reviewFooter,
  // which takes over once the sheet is dismissed, already did.
  const last = s.i === s.qs.length - 1;
  const content = h(`
    <div class="review">
      <div class="review-verdict">
        <span class="${given.ok ? 'ok' : 'err'}">${given.ok ? 'Верно' : 'Неверно'}</span>
        <span class="muted">${esc(answerSummary(q, given))}</span>
      </div>
      ${rationaleBlocks(q, given)}
      <div class="review-theory"></div>
      <div class="review-actions">
        <button class="btn soft" data-act="ai" type="button">Разобрать с ИИ</button>
        <button class="btn primary grow" data-act="next" type="button">${last ? 'Завершить' : 'Следующий →'}</button>
      </div>
    </div>`);

  reviewDismissed = false;
  content.querySelector('[data-act="next"]').addEventListener('click', () => (last ? tryFinish(ctx) : move(ctx, 1)));
  content.querySelector('[data-act="ai"]').addEventListener('click', () => {
    closeReview();
    ctx.router.modal(aiPromptScreen, {
      items: [{ q, answer: given }],
      // "Все ошибки домена" offers the rest of this session's mistakes in the same domain.
      moreItems: sessionMistakes(s, ctx.bank).filter(item => item.q.dom === q.dom),
    });
  });

  // The chapter that covers this question, offered right where the mistake is fresh. The
  // book loads on demand, so the sheet is already on screen when the link appears; it
  // opens as a modal over the question, and Android back returns to the session.
  Promise.all([loadMap(), loadIndex()]).then(([map, index]) => {
    const t = index.byId.get(map[q.n]);
    const slot = t && content.querySelector('.review-theory');
    if (!slot) return;
    slot.innerHTML = `<button class="btn soft wide" data-act="theory" type="button">
      Теория: ${esc(t.title)}</button>`;
    slot.querySelector('button').addEventListener('click', () => {
      closeReview();
      ctx.router.modal(topicScreen, { id: t.id });
    });
  }).catch(() => {});

  const { panel } = openSheet(content, {
    // Tapping the dim, or Android back, leaves the question underneath — dimmed and with
    // no action bar, which is where the screen used to go dead. Undo both.
    onClose: () => {
      if (leavingReview) return;             // the screen is on its way out; nothing to restore
      reviewDismissed = true;
      els.body?.classList.remove('graded');
      ctx.router.renderFooter();
    },
  });

  // The sheet's backdrop covers the whole screen, so once it is up the pane never hears a
  // finger again — «свайп → далее» stopped being true the moment an answer was graded,
  // leaving the button as the only way on. The same gesture, on the sheet itself: the
  // panel follows the finger and hands off to the next question, which closes the sheet
  // on its way (move -> closeReview).
  bindSwipe(panel.parentElement, ctx, panel);
}

// Navigation closes the sheet on its way somewhere else — say so, so the dismissal
// handler above does not mistake it for the user putting the sheet away.
//
// Landing on a different question is not asking to see its rationale again — only the
// "Ответить" tap (gradeCurrent) or the matching "Проверить" tap that just graded it counts
// as that ask, and both set reviewDismissed = false themselves without going through here.
// So every navigational caller — move, tryFinish, the ☰ grid — gets silence by default:
// the destination renders its graded colors on the card, not the sheet on top of it.
function closeReview(silence = true) {
  cancelReveal();
  leavingReview = true;
  closeSheet();
  leavingReview = false;
  reviewDismissed = silence;
}

// ---------------------------------------------------------------- question grid
function openGrid(ctx) {
  const s = store.session;
  const cells = s.qs.map((n, idx) => {
    const cls = ['grid-cell'];
    if (idx === s.i) cls.push('cur');
    if (s.answers[n] !== undefined) cls.push('done');
    if (s.flags.includes(n)) cls.push('flagged');
    return `<button class="${cls.join(' ')}" data-i="${idx}" type="button">${idx + 1}</button>`;
  }).join('');

  const content = h(`
    <div class="grid-sheet">
      <div class="label">Вопросы · отвечено ${s.qs.filter(n => s.answers[n] !== undefined).length} из ${s.qs.length}</div>
      <div class="grid">${cells}</div>
    </div>`);

  content.addEventListener('click', e => {
    const cell = e.target.closest('[data-i]');
    if (!cell) return;
    closeReview();
    const target = +cell.dataset.i;
    enterDir = target === s.i ? 0 : (target > s.i ? 1 : -1);
    store.patchSession({ i: target });
    pendingFor = null;
    ctx.router.render();
  });
  openSheet(content);
}

// ---------------------------------------------------------------- timer
function startTimer(ctx) {
  stopTimer();
  if (!store.session?.endsAt) {
    if (els.timer) els.timer.textContent = '';
    return;
  }
  const tick = () => {
    const left = remainingMs(store.session);
    if (left === null) return;
    if (els.timer) {
      els.timer.textContent = fmtClock(left);
      els.timer.classList.toggle('low', left < LOW_TIME_MS);
    }
    if (left <= 0) { stopTimer(); finish(ctx); }
  };
  tick();
  timer = setInterval(tick, 1000);
}

function stopTimer() {
  if (timer) { clearInterval(timer); timer = null; }
}

// ---------------------------------------------------------------- screen
export const question = {
  id: 'question',
  header,
  footer,
  render,

  mount(node, ctx) {
    animateIn(node);
    // The bar was painted at its previous width. Now that the header is in the document,
    // reading offsetWidth settles that width, so assigning the new one transitions from
    // it — no waiting for a frame that a backgrounded WebView would never serve.
    if (els.bar) {
      void els.bar.offsetWidth;
      els.bar.style.width = `${els.barTo}%`;
    }
    startTimer(ctx);
    // Only for a timed exam, and only while it is on screen: a study session that sits
    // untouched should let the phone sleep like anything else.
    if (store.session?.mode === 'exam' && store.session.keepAwake !== false) keepScreenOn();
    else releaseScreen();
  },

  unmount() {
    stopTimer();
    releaseScreen();
    closeReview();
    resetMatch();
    pending = new Set();
    pendingFor = null;
    els = {};
    enterDir = 0;
    shownPct = null;
    animating = false;
    reviewDismissed = false;
    revealed = false;
  },

  // Leaving mid-exam is a real decision — the spec asks for a confirmation, and the
  // reassurance that nothing is lost, which is true now that the session is persisted.
  beforeBack(ctx) {
    if (store.session?.mode !== 'exam') return true;
    confirmDialog({
      title: 'Выйти из экзамена?',
      text: 'Прогресс сохранится — вернуться можно с главной.',
      ok: 'Выйти',
      cancel: 'Остаться',
    }).then(yes => {
      if (!yes) return;
      store.flush();
      ctx.router.back({ force: true });
    });
    return false;
  },
};
