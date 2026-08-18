// Entry point: load the persisted state and the bank from dist/data, then start the
// router. Everything is local — no network call happens at any point.
import { router } from './router.js';
import { store, bindPersistOnPause } from './store.js';
import { reschedule } from './notify.js';
import { scorable } from '../engine/select.js';
import { sessionIsValid } from './session.js';
import { home } from './screens/home.js';
import { theory } from './screens/theory.js';
import { learn } from './screens/learn.js';
import { exam } from './screens/exam.js';
import { progress } from './screens/progress.js';
import { onboarding } from './screens/onboarding.js';

const TABS = [
  { id: 'home', label: 'Главная', screen: home },
  { id: 'theory', label: 'Теория', screen: theory },
  { id: 'learn', label: 'Учить', screen: learn },
  { id: 'exam', label: 'Экзамен', screen: exam },
  { id: 'progress', label: 'Прогресс', screen: progress },
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

async function boot() {
  try {
    const [bank] = await Promise.all([loadBank(), store.load()]);

    // A session stored against an older bank (build_data.py renumbers questions) would
    // resolve to undefined mid-exam. Drop it rather than crash on the first render.
    if (store.session && !sessionIsValid(store.session, bank)) {
      console.warn('store: stored session does not match the current bank, discarding');
      store.clearSession();
    }

    bindPersistOnPause(() => reschedule());
    router.init({ tabs: TABS, ctx: { bank } });

    // Startup is the other moment the reminders can be stale: a day rolled over, or the
    // quota was met in a session that ended without the app going to background.
    reschedule();

    // First launch: ask the two questions that change what the app does, over the home
    // screen rather than in front of it, so backing out lands somewhere usable.
    if (!store.profile.onboarded) router.modal(onboarding);
  } catch (err) {
    document.getElementById('scroll').innerHTML =
      `<h1 class="screen-title">Не удалось запуститься</h1>
       <p class="muted">${err.message}. Проверь, что перед сборкой отработал <code>npm run sync-data</code>.</p>`;
  }
}

boot();
