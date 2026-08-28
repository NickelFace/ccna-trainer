// Tab 4 — attempt history (spec 08).
//
// The chart is plain divs: eight bars and a dashed threshold line do not justify a
// charting library in an app that must ship every byte inside the APK.
import { esc, h } from '../dom.js';
import { store } from '../store.js';
import { PASS_SCALED, SCALE_MIN, SCALE_MAX } from '../../engine/score.js';
import {
  msPerQuestion, scaledDelta, weakTopics, scoreTone, toneFor,
  scoredAttempts, dayStats, recentDays, isAbandoned, answeredIn,
} from '../../engine/stats.js';
import { startPractice } from '../session.js';
import { confirmDialog } from '../dialog.js';
import { exportBackup, readBackupFile } from '../backup.js';
import { syncCard, wireSync } from '../sync-ui.js';
import { toast } from '../toast.js';
import { question as questionScreen } from './question.js';
import { result as resultScreen } from './result.js';
import { t, pluralWord, WORDS } from '../i18n.js';

const CHART_H = 104;
const MAX_BARS = 8;
const STRIP_H = 64;
const STRIP_DAYS = 14;

const MODE_LABEL = () => ({ practice: t('progress.mode.practice'), srs: t('progress.mode.srs') });

const barHeight = scaled =>
  Math.max(3, Math.round(((scaled - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * CHART_H));

const fmtMinSec = ms => {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

const fmtDate = ts => new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

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
    <div class="label spaced">${esc(t('progress.today', { n: d.total, goal }))}</div>
    <div class="mini-stats">
      <div class="card mini"><b class="mono">${d.total}</b><span>${esc(t('progress.today.answered'))}</span></div>
      <div class="card mini"><b class="mono${d.wrong ? ' err' : ''}">${d.wrong}</b><span>${esc(pluralWord(d.wrong, WORDS.mistakes))}</span></div>
      <div class="card mini"><b class="mono">${d.srs}</b><span>${esc(t('progress.today.srs'))}</span></div>
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
    const title = `${esc(fmtDate(d.ts))}: ${d.total}, ${esc(pluralWord(d.wrong, WORDS.mistakes))} ${d.wrong}`;
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
    const dropped = isAbandoned(a);
    const label = a.mode === 'exam'
      ? (a.weighted ? t('progress.history.exam') : t('progress.history.customExam'))
      : (MODE_LABEL()[a.mode] || t('progress.history.practice'));
    // A weighted attempt shows the 300..1000 score, same as everywhere else it appears;
    // anything else shows its percentage — never a scaled number that would look
    // comparable to a real exam result but was drawn from a biased or tiny sample. An
    // abandoned run shows the percentage of what it did answer, and says so.
    const asked = dropped ? answeredIn(a) : a.total;
    const pct = asked ? Math.round((a.ok / asked) * 100) : 0;
    const value = a.weighted && !dropped
      ? `<span class="mono ${scoreTone(a.scaled)}">${a.scaled}</span>`
      : `<span class="mono ${toneFor(pct)}">${pct}%</span>`;
    return `
      <button class="history-row" data-attempt="${esc(a.id)}" type="button">
        <span class="history-main">
          <span>${esc(label)} · ${esc(fmtDate(a.date))}</span>
          <span class="muted">${dropped
            ? esc(t('progress.history.notCounted', { ok: a.ok, asked, total: a.total }))
            : esc(t('progress.history.correctPerQuestion', { ok: a.ok, total: a.total, time: fmtMinSec(msPerQuestion(a)) }))}</span>
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
      <div class="card-head"><span>${esc(t('progress.backup.title'))}</span></div>
      <p class="muted">${esc(t('progress.backup.body'))}</p>
      <div class="backup-actions">
        <button class="btn" data-act="export" type="button">${esc(t('progress.backup.export'))}</button>
        <button class="btn" data-act="import" type="button">${esc(t('progress.backup.import'))}</button>
      </div>
      <input class="backup-file" type="file" accept="application/json" hidden>
    </div>`;
}

function topicCards(topics) {
  return topics.map(t2 => `
    <div class="topic-card">
      <span class="topic-main">
        <span class="topic-name">${esc(t2.topic)}</span>
        <span class="muted">${esc(t('progress.topic.correct', { ok: t2.ok, tot: t2.tot, pct: t2.pct }))}</span>
      </span>
      <button class="btn soft small" data-topic="${esc(t2.topic)}" type="button">${esc(t('progress.topic.learn'))}</button>
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
        <div class="card-head"><span>${esc(t('progress.activityDays', { n: STRIP_DAYS }))}</span></div>
        ${activityStrip(store.activity, goal, now)}
      </div>`;

    if (!attempts.length) {
      const node = h(`
        <h1 class="screen-title">${esc(t('progress.title'))}</h1>
        ${activityBlock}
        <div class="card empty">
          <p>${esc(t('progress.empty.body'))}</p>
          <p class="muted">${esc(t('progress.empty.hint'))}</p>
        </div>
        ${syncCard()}
        ${backupCard()}`);
      wireBackup(node);
      wireSync(node, ctx);
      return node;
    }

    const scored = scoredAttempts(attempts);
    const delta = scored.length ? scaledDelta(scored) : null;
    // "In the last attempt" means the last one that counts — an exam closed after one
    // answer is not the run this number is about.
    const lastCounted = [...attempts].reverse().find(a => !isAbandoned(a)) || attempts[attempts.length - 1];
    // Speed is per question asked, so an exam that was closed after one answer would
    // report a fraction of a second per question and pull the average through the floor.
    // Those runs are not results (see isAbandoned) and do not belong in it.
    const timed = attempts.filter(a => !isAbandoned(a));
    const avgMs = timed.length
      ? Math.round(timed.reduce((sum, a) => sum + msPerQuestion(a), 0) / timed.length) : 0;
    const topics = weakTopics(attempts, bank.byN);

    const node = h(`
      <h1 class="screen-title">${esc(t('progress.title'))}</h1>
      ${activityBlock}
      ${scored.length ? `
        <div class="card chart-card">
          <div class="card-head">
            <span>${esc(t('progress.scoresFor', { n: scored.length, attempts: pluralWord(scored.length, WORDS.attemptsAcc) }))}</span>
            ${delta === null ? '' : `<span class="mono ${delta >= 0 ? 'ok' : 'err'}">${delta > 0 ? '+' : ''}${delta}</span>`}
          </div>
          ${chart(scored)}
        </div>` : `
        <div class="card chart-card">
          <div class="card-head"><span>${esc(t('progress.scores.title'))}</span></div>
          <p class="muted">${esc(t('progress.scores.empty'))}</p>
        </div>`}
      <div class="mini-stats">
        <div class="card mini"><b class="mono">${fmtMinSec(avgMs)}</b><span>${esc(t('progress.avgPerQuestion'))}</span></div>
        <div class="card mini"><b class="mono">${lastCounted.pct}%</b><span>${esc(t('progress.lastAttemptPct'))}</span></div>
      </div>
      ${topics.length ? `
        <div class="label spaced">${esc(t('progress.weakTopics'))}</div>
        <div class="topics">${topicCards(topics)}</div>` : ''}
      <div class="label spaced">${esc(t('progress.allAttempts'))}</div>
      <div class="card tight">${historyRows(attempts)}</div>
      ${syncCard()}
      ${backupCard()}
    `);

    node.addEventListener('click', async e => {
      const topicBtn = e.target.closest('[data-topic]');
      if (topicBtn) {
        if (store.session) {
          const yes = await confirmDialog({
            title: t('common.startTraining.title'),
            text: t('common.unfinishedLost'),
            ok: t('common.start'), cancel: t('common.cancel'),
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
    wireSync(node, ctx);
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
        title: t('progress.restore.title'),
        text: t('progress.restore.body'),
        ok: t('progress.restore.ok'), cancel: t('common.cancel'),
      });
      if (!yes) return;
      await store.restore(data);
      location.reload();
    } catch (err) {
      toast(err.message || t('backup.readFailed'));
    }
  });
}
