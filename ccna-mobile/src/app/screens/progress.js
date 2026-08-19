// Tab 4 — attempt history (spec 08).
//
// The chart is plain divs: eight bars and a dashed threshold line do not justify a
// charting library in an app that must ship every byte inside the APK.
import { esc, h } from '../dom.js';
import { store } from '../store.js';
import { PASS_SCALED, SCALE_MIN, SCALE_MAX } from '../../engine/score.js';
import {
  msPerQuestion, scaledDelta, weakTopics, scoreTone, toneFor,
  scoredAttempts, dayStats, recentDays,
} from '../../engine/stats.js';
import { startPractice } from '../session.js';
import { confirmDialog } from '../dialog.js';
import { exportBackup, readBackupFile } from '../backup.js';
import { toast } from '../toast.js';
import { question as questionScreen } from './question.js';
import { result as resultScreen } from './result.js';

const CHART_H = 104;
const MAX_BARS = 8;
const STRIP_H = 64;
const STRIP_DAYS = 14;

const MODE_LABEL = { practice: 'Тренировка', srs: 'Повторение' };

const barHeight = scaled =>
  Math.max(3, Math.round(((scaled - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * CHART_H));

const fmtMinSec = ms => {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

const fmtDate = ts => new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

const plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

// Only a blueprint-weighted attempt (see isScored in stats.js) belongs on the score
// chart — the pass threshold and the 300..1000 scale are calibrated to that sample.
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

// "Сегодня" — the direct answer to "сколько прошёл, сколько из них ошибочных, сколько
// была работа над ошибками", read straight off store.activity rather than derived from
// attempts (an unfinished session already left marks here, even with no attempt yet).
function todayCard(activity, goal, now) {
  const d = dayStats(activity, now);
  return `
    <div class="label spaced">Сегодня · ${d.total} из ${goal}</div>
    <div class="mini-stats">
      <div class="card mini"><b class="mono">${d.total}</b><span>отвечено</span></div>
      <div class="card mini"><b class="mono${d.wrong ? ' err' : ''}">${d.wrong}</b><span>${plural(d.wrong, 'ошибка', 'ошибки', 'ошибок')}</span></div>
      <div class="card mini"><b class="mono">${d.srs}</b><span>работа над ошибками</span></div>
    </div>`;
}

// One bar per of the last 14 days: height by volume, tone by whether the daily goal was
// met — the same "did I follow the plan" question the home screen's quota answers for
// today alone, over a window long enough to actually see a pattern in.
function activityStrip(activity, goal, now) {
  const days = recentDays(activity, now, STRIP_DAYS);
  const cap = Math.max(goal, ...days.map(d => d.total), 1);
  const bars = days.map(d => {
    const height = Math.max(3, Math.round((d.total / cap) * STRIP_H));
    const tone = d.total === 0 ? '' : d.total >= goal ? 'ok' : 'warn';
    const title = `${esc(fmtDate(d.ts))}: ${d.total}, ошибок ${d.wrong}`;
    return `<div class="bar ${tone}" style="height:${height}px" title="${title}"></div>`;
  }).join('');

  return `
    <div class="chart" style="--chart-h:${STRIP_H}px">
      <div class="chart-plot">
        <div class="chart-threshold" style="bottom:${Math.max(3, Math.round((goal / cap) * STRIP_H))}px">
          <span class="mono">${goal}</span>
        </div>
        <div class="chart-bars">${bars}</div>
      </div>
    </div>`;
}

function historyRows(attempts) {
  return attempts.slice().reverse().map(a => {
    const label = a.mode === 'exam'
      ? (a.weighted ? 'Экзамен' : 'Свой экзамен')
      : (MODE_LABEL[a.mode] || 'Тренировка');
    // A weighted attempt shows the 300..1000 score, same as everywhere else it appears;
    // anything else shows its percentage — never a scaled number that would look
    // comparable to a real exam result but was drawn from a biased or tiny sample.
    const value = a.weighted
      ? `<span class="mono ${scoreTone(a.scaled)}">${a.scaled}</span>`
      : `<span class="mono ${toneFor(a.pct)}">${a.pct}%</span>`;
    return `
      <button class="history-row" data-attempt="${esc(a.id)}" type="button">
        <span class="history-main">
          <span>${esc(label)} · ${esc(fmtDate(a.date))}</span>
          <span class="muted">${a.ok}/${a.total} верно · ${fmtMinSec(msPerQuestion(a))} на вопрос</span>
        </span>
        ${value}
      </button>`;
  }).join('');
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
    const now = Date.now();
    const goal = store.profile.dailyGoal;

    // Driven by store.activity, not by attempts — a session still in progress already
    // left marks here, so this shows up even before the very first attempt exists.
    const activityBlock = `
      ${todayCard(store.activity, goal, now)}
      <div class="card chart-card">
        <div class="card-head"><span>Активность за ${STRIP_DAYS} дней</span></div>
        ${activityStrip(store.activity, goal, now)}
      </div>`;

    if (!attempts.length) {
      const node = h(`
        <h1 class="screen-title">Прогресс</h1>
        ${activityBlock}
        <div class="card empty">
          <p>Здесь появится график баллов, средняя скорость и темы, которые проседают.</p>
          <p class="muted">Пройди первый пробный экзамен — одной попытки уже хватит, чтобы
          увидеть расклад по доменам.</p>
        </div>
        ${backupCard()}`);
      wireBackup(node);
      return node;
    }

    const scored = scoredAttempts(attempts);
    const delta = scored.length ? scaledDelta(scored) : null;
    const lastAttempt = attempts[attempts.length - 1];
    const avgMs = Math.round(attempts.reduce((sum, a) => sum + msPerQuestion(a), 0) / attempts.length);
    const topics = weakTopics(attempts, bank.byN);

    const node = h(`
      <h1 class="screen-title">Прогресс</h1>
      ${activityBlock}
      ${scored.length ? `
        <div class="card chart-card">
          <div class="card-head">
            <span>Баллы за ${scored.length} ${scored.length === 1 ? 'попытку' : 'попыток'}</span>
            ${delta === null ? '' : `<span class="mono ${delta >= 0 ? 'ok' : 'err'}">${delta > 0 ? '+' : ''}${delta}</span>`}
          </div>
          ${chart(scored)}
        </div>` : `
        <div class="card chart-card">
          <div class="card-head"><span>Баллы</span></div>
          <p class="muted">Появятся после «Как на экзамене» или «Короткий прогон» — это
          единственные режимы, взвешенные по блюпринту так же, как настоящий тест.</p>
        </div>`}
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
