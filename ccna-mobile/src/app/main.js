// Entry point: load the persisted state and the bank from dist/data, then start the
// router. Everything the app needs is bundled — the only network call it ever makes is the
// progress sync, and only when a sync key has been set up.
import { router } from './router.js';
import { store, bindPersistOnPause, bindResume } from './store.js';
import { autoSyncer } from '../../../ccna-exam-simulator/assets/js/shared/sync.js?v=22';
import { reschedule, initNotificationListener } from './notify.js';
import { scorable } from '../engine/select.js';
import { sessionIsValid } from './session.js';
import { t } from './i18n.js';
import { home } from './screens/home.js';
import { theory } from './screens/theory.js';
import { learn } from './screens/learn.js';
import { exam } from './screens/exam.js';
import { progress } from './screens/progress.js';
import { onboarding } from './screens/onboarding.js';

const TABS = [
  { id: 'home', labelKey: 'tab.home', screen: home },
  { id: 'theory', labelKey: 'tab.theory', screen: theory },
  { id: 'learn', labelKey: 'tab.learn', screen: learn },
  { id: 'exam', labelKey: 'tab.exam', screen: exam },
  { id: 'progress', labelKey: 'tab.progress', screen: progress },
];

async function loadBank() {
  const t0 = performance.now();
  const [questions, meta] = await Promise.all([
    fetch('data/questions.json').then(r => r.json()),
    fetch('data/meta.json').then(r => r.json()),
  ]);
  return {
    questions,
    meta,
    // byN resolves the question numbers a stored session holds; pool is what may be asked.
    byN: new Map(questions.map(q => [q.n, q])),
    pool: questions.filter(scorable),
    loadMs: Math.round(performance.now() - t0),
  };
}

// A sync that pulled in the other device's work only redraws where that is visible, and
// never over a modal: re-rendering the question screen mid-exam would throw away the
// scroll position and whatever half-made choice is on it. `theory` is in the set because
// read marks are one of the things that arrive; `topic` is not — a chapter being read is
// as bad a place to redraw as a question being answered.
const REDRAWABLE = new Set(['home', 'progress', 'theory']);

function redrawIfSafe() {
  if (router.modals.length) return;
  if (!REDRAWABLE.has(router.current()?.screen?.id)) return;
  router.render();
}

async function boot() {
  try {
    const [bank] = await Promise.all([loadBank(), store.load()]);

    // A session stored against an older bank (build_data.py renumbers questions) would
    // resolve to undefined mid-exam. Drop it rather than crash on the first render.
    if (store.session && !sessionIsValid(store.session, bank)) {
      console.warn('store: stored session does not match the current bank, discarding');
      store.clearSession();
    }

    // Same rebuild can also drop or renumber a question that's sitting in the SRS map —
    // clear those out now, while the current bank is known, rather than letting nextDueAt
    // report a "ghost" as the next repetition forever.
    store.pruneGhostSrs(qn => bank.byN.has(qn));

    // Automatic syncing, on the three moments that matter: launching, going to background
    // with work the server has not seen, and coming back — that last one is a read, and
    // it is what makes a chapter marked read on the site be marked here by the time the
    // phone is looked at. Failures are silent by design — the progress is on the phone
    // either way, and a toast about a tunnel helps nobody.
    //
    // `pulled`, not `wrote`: a device that only receives the other's work writes nothing,
    // and a redraw keyed on the write would leave the screen showing the old numbers.
    const autoSync = autoSyncer(store, {
      onDone: result => { if (result && (result.pulled || result.wrote)) redrawIfSafe(); },
      onError: err => console.warn('sync:', err.code || 'failed', err.message),
    });

    bindPersistOnPause(() => { reschedule(); autoSync('leave'); });
    bindResume(() => autoSync('resume'));
    initNotificationListener();
    router.init({ tabs: TABS, ctx: { bank } });

    // Startup is the other moment the reminders can be stale: a day rolled over, or the
    // quota was met in a session that ended without the app going to background.
    reschedule();

    // First launch: ask the two questions that change what the app does, over the home
    // screen rather than in front of it, so backing out lands somewhere usable.
    if (!store.profile.onboarded) router.modal(onboarding);

    autoSync('start');
  } catch (err) {
    document.getElementById('scroll').innerHTML =
      `<h1 class="screen-title">${t('boot.failTitle')}</h1>
       <p class="muted">${t('boot.failBody', { message: err.message })}</p>`;
  }
}

boot();
