// Tab 4 — attempt history (spec 08).
//
// The chart is plain divs: eight bars and a dashed threshold line do not justify a
// charting library in an app that must ship every byte inside the APK.
import { esc, h } from '../dom.js';
import { store } from '../store.js';
import { PASS_SCALED, SCALE_MIN, SCALE_MAX } from '../../engine/score.js';
import { msPerQuestion, scaledDelta, weakTopics, scoreTone } from '../../engine/stats.js';
import { startPractice } from '../session.js';
import { confirmDialog } from '../dialog.js';
import { exportBackup, readBackupFile } from '../backup.js';
import { toast } from '../toast.js';
import { question as questionScreen } from './question.js';
import { result as resultScreen } from './result.js';

const CHART_H = 104;
const MAX_BARS = 8;

const barHeight = scaled =>
  Math.max(3, Math.round(((scaled - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * CHART_H));

const fmtMinSec = ms => {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

const fmtDate = ts => new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

function chart(attempts) {
  const slice = attempts.slice(-MAX_BARS);
  const last = slice.length - 1;
  const bars = slice.map((a, i) => {
    // Newest bar in --primary, the two before it in --primary-strong, the rest muted.
    const tone = i === last ? 'now' : i >= last - 2 ? 'recent' : 'past';
    return `<div class="bar ${tone}" style="height:${barHeight(a.scaled)}px" title="${a.scaled}"></div>`;
  }).join('');
  const labels = slice.map((a, i) =>
    `<span class="${i === last ? 'now' : ''}">${a.scaled}</span>`).join('');

  return `
    <div class="chart" style="--chart-h:${CHART_H}px">
      <div class="chart-plot">
        <div class="chart-threshold" style="bottom:${barHeight(PASS_SCALED)}px">
          <span class="mono">${PASS_SCALED}</span>
        </div>
        <div class="chart-bars">${bars}</div>
      </div>
      <div class="chart-labels mono">${labels}</div>
    </div>`;
}

function historyRows(attempts) {
  return attempts.slice().reverse().map(a => `
    <button class="history-row" data-attempt="${esc(a.id)}" type="button">
      <span class="history-main">
        <span>${a.mode === 'exam' ? 'Экзамен' : 'Тренировка'} · ${esc(fmtDate(a.date))}</span>
        <span class="muted">${a.ok}/${a.total} верно · ${fmtMinSec(msPerQuestion(a))} на вопрос</span>
      </span>
      <span class="mono ${scoreTone(a.scaled)}">${a.scaled}</span>
    </button>`).join('');
}

// Progress lives only on this phone; this is the one place in the app that says so and
// offers a way out. Shown regardless of whether there is an attempt yet — bookmarks, SRS
// state and an unfinished session are all worth saving too.
function backupCard() {
  return `
    <div class="card backup-card">
      <div class="card-head"><span>Резервная копия</span></div>
      <p class="muted">Прогресс хранится только на этом телефоне. Сохрани копию перед
      переустановкой или сменой телефона — импорт вернёт всё как было, включая профиль
      и закладки.</p>
      <div class="backup-actions">
        <button class="btn" data-act="export" type="button">Экспорт</button>
        <button class="btn" data-act="import" type="button">Импорт</button>
      </div>
      <input class="backup-file" type="file" accept="application/json" hidden>
    </div>`;
}

function topicCards(topics) {
  return topics.map(t => `
    <div class="topic-card">
      <span class="topic-main">
        <span class="topic-name">${esc(t.topic)}</span>
        <span class="muted">${t.ok} из ${t.tot} верно · ${t.pct}%</span>
      </span>
      <button class="btn soft small" data-topic="${esc(t.topic)}" type="button">Учить</button>
    </div>`).join('');
}

export const progress = {
  id: 'progress',

  render(ctx) {
    const attempts = store.attempts;
    const { bank } = ctx;

    if (!attempts.length) {
      const node = h(`
        <h1 class="screen-title">Прогресс</h1>
        <div class="card empty">
          <p>Здесь появится график баллов, средняя скорость и темы, которые проседают.</p>
          <p class="muted">Пройди первый пробный экзамен — одной попытки уже хватит, чтобы
          увидеть расклад по доменам.</p>
        </div>
        ${backupCard()}`);
      wireBackup(node);
      return node;
    }

    const delta = scaledDelta(attempts);
    const lastAttempt = attempts[attempts.length - 1];
    const avgMs = Math.round(attempts.reduce((sum, a) => sum + msPerQuestion(a), 0) / attempts.length);
    const topics = weakTopics(attempts, bank.byN);

    const node = h(`
      <h1 class="screen-title">Прогресс</h1>
      <div class="card chart-card">
        <div class="card-head">
          <span>Баллы за ${attempts.length} ${attempts.length === 1 ? 'попытку' : 'попыток'}</span>
          ${delta === null ? '' : `<span class="mono ${delta >= 0 ? 'ok' : 'err'}">${delta > 0 ? '+' : ''}${delta}</span>`}
        </div>
        ${chart(attempts)}
      </div>
      <div class="mini-stats">
        <div class="card mini"><b class="mono">${fmtMinSec(avgMs)}</b><span>средн. на вопрос</span></div>
        <div class="card mini"><b class="mono">${lastAttempt.pct}%</b><span>в последней попытке</span></div>
      </div>
      ${topics.length ? `
        <div class="label spaced">Слабые темы</div>
        <div class="topics">${topicCards(topics)}</div>` : ''}
      <div class="label spaced">Все попытки</div>
      <div class="card tight">${historyRows(attempts)}</div>
      ${backupCard()}
    `);

    node.addEventListener('click', async e => {
      const topicBtn = e.target.closest('[data-topic]');
      if (topicBtn) {
        if (store.session) {
          const yes = await confirmDialog({
            title: 'Начать тренировку?',
            text: 'Незаконченная сессия будет потеряна.',
            ok: 'Начать', cancel: 'Отмена',
          });
          if (!yes) return;
        }
        startPractice(bank, { count: 20, topic: topicBtn.dataset.topic });
        return ctx.router.modal(questionScreen);
      }

      const row = e.target.closest('[data-attempt]');
      if (row) {
        const attempt = attempts.find(a => a.id === row.dataset.attempt);
        if (attempt) ctx.router.modal(resultScreen, { attempt });
      }
    });

    wireBackup(node);
    return node;
  },
};

// Export needs no confirmation — it changes nothing. Import overwrites the whole store,
// so it asks first and then reloads the app rather than trying to hand-patch every screen
// that could be showing.
function wireBackup(node) {
  const fileInput = node.querySelector('.backup-file');

  node.querySelector('[data-act="export"]')?.addEventListener('click', () => exportBackup());
  node.querySelector('[data-act="import"]')?.addEventListener('click', () => fileInput.click());

  fileInput?.addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = await readBackupFile(file);
      const yes = await confirmDialog({
        title: 'Восстановить резервную копию?',
        text: 'Текущий прогресс на телефоне будет заменён тем, что в файле.',
        ok: 'Восстановить', cancel: 'Отмена',
      });
      if (!yes) return;
      await store.restore(data);
      location.reload();
    } catch (err) {
      toast(err.message || 'Не удалось восстановить копию.');
    }
  });
}
