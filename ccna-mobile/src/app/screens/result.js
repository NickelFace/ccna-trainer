// Exam / practice result (spec 07).
//
// The attempt is already in the history by the time this renders — finishSession() files
// it before handing over, so a crash on this screen cannot cost the run.
import { esc, h } from '../dom.js';
import { PASS_SCALED, SCALE_MIN, SCALE_MAX } from '../../engine/score.js';
import {
  toneFor, scoreTone, msPerQuestion, scaledDelta, pointsToPass, weakDomains, mistakesOf,
  isScored, scoredAttempts, isAbandoned, answeredIn, perDomainOf,
} from '../../engine/stats.js';
import { store } from '../store.js';
import { review as reviewScreen } from './review.js';
import { aiPrompt as aiPromptScreen } from './ai-prompt.js';

const MODE_LABEL = { practice: 'Тренировка', srs: 'Повторение' };

const scalePct = scaled => ((scaled - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100;

const fmtMinSec = ms => {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

const plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

// The line under the score: how far from the threshold, in either direction.
function gapLine(attempt) {
  const gap = pointsToPass(attempt);
  if (gap > 0) return `не хватило ${gap} ${plural(gap, 'балла', 'баллов', 'баллов')} до порога ${PASS_SCALED}`;
  if (gap === 0) return `ровно порог ${PASS_SCALED}`;
  return `запас ${-gap} ${plural(-gap, 'балл', 'балла', 'баллов')} над порогом ${PASS_SCALED}`;
}

// The 300..1000 score, the threshold gap and the scale bar only mean something for a
// blueprint-weighted attempt (see isScored) — this is what a real exam or "Короткий
// прогон" gets.
function scoreCard(attempt, delta) {
  return `
    <div class="card score-card">
      <div class="score mono ${scoreTone(attempt.scaled)}">${attempt.scaled}</div>
      <div class="muted">${esc(gapLine(attempt))}</div>
      <div class="scale">
        <div class="scale-track">
          <i style="width:${scalePct(attempt.scaled)}%"></i>
          <span class="scale-mark" style="left:${scalePct(PASS_SCALED)}%"></span>
        </div>
        <div class="scale-labels mono">
          <span>${SCALE_MIN}</span><span>порог ${PASS_SCALED}</span><span>${SCALE_MAX}</span>
        </div>
      </div>
      <div class="score-stats">
        <div class="stat"><b class="mono">${attempt.ok}/${attempt.total}</b><span>верно</span></div>
        <div class="stat"><b class="mono">${fmtMinSec(msPerQuestion(attempt))}</b><span>мин / вопрос</span></div>
        <div class="stat"><b class="mono">${delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta}`}</b><span>к прошлой</span></div>
      </div>
    </div>`;
}

// Practice, repetition and a filtered/weak-domains exam still get graded — the domain
// breakdown below is useful regardless — but never show a 300..1000 number next to them:
// it would read as comparable to a real exam while actually being a biased or tiny
// sample. A plain fraction says exactly as much as is true.
//
// An abandoned run (see isAbandoned) is the same card with a smaller denominator: the
// questions that were answered, not the ones that were drawn. Nothing is hidden — the
// line underneath says how far the run actually got — but the fraction on top is about
// the answers given, so getting all four right reads as four out of four.
function plainCard(attempt) {
  const dropped = isAbandoned(attempt);
  const asked = dropped ? answeredIn(attempt) : attempt.total;
  const pct = asked ? Math.round((attempt.ok / asked) * 100) : 0;
  const label = dropped
    ? `Не засчитана · отвечено ${answeredIn(attempt)} из ${attempt.total}`
    : (attempt.mode === 'exam' ? 'Свой экзамен' : (MODE_LABEL[attempt.mode] || 'Тренировка'));
  return `
    <div class="card score-card plain">
      <div class="score mono ${toneFor(pct)}">${attempt.ok}/${asked}</div>
      <div class="muted">${esc(label)} · ${pct}% верно</div>
      <div class="score-stats">
        <div class="stat"><b class="mono">${pct}%</b><span>точность</span></div>
        <div class="stat"><b class="mono">${fmtMinSec(msPerQuestion(attempt))}</b><span>мин / вопрос</span></div>
      </div>
    </div>`;
}

function nextStepCard(attempt, perDomain, bank, mistakes) {
  const weak = weakDomains({ ...attempt, perDomain }, bank.meta.domains);
  const detail = weak.length
    ? `Слабее всего ${weak.map(d => `${d.name.replace(/^\d+\.\d+\s+/, '')} (${d.pct}%)`).join(' и ')}.`
    : 'По доменам ровно — добирай объёмом.';

  return `
    <div class="card next-step">
      <div class="next-step-title">Что делать дальше</div>
      <p class="next-step-text">${mistakes.length
        ? `${mistakes.length} ${plural(mistakes.length, 'ошибка', 'ошибки', 'ошибок')} в этой попытке. ${esc(detail)}`
        : 'Ни одной ошибки — бери следующий домен или подними объём.'}</p>
      ${mistakes.length
        ? `<button class="btn primary wide" data-act="mistakes" type="button">Работа над ошибками · ${mistakes.length}</button>`
        : ''}
    </div>`;
}

function domainRows(perDomain, domains) {
  return domains.map(d => {
    const p = perDomain[d.id] || { ok: 0, tot: 0 };
    if (!p.tot) return '';
    const pct = Math.round((p.ok / p.tot) * 100);
    return `
      <div class="dbar">
        <div class="dbar-top">
          <span>${esc(d.name.replace(/^\d+\.\d+\s+/, ''))}</span>
          <span class="mono muted">${p.ok}/${p.tot} · ${pct}%</span>
        </div>
        <div class="dbar-track"><i class="${toneFor(pct)}" style="width:${pct}%"></i></div>
      </div>`;
  }).join('');
}

export const result = {
  id: 'result',

  header: ctx => {
    const b = document.createElement('button');
    b.className = 'back-btn';
    b.type = 'button';
    b.innerHTML = '<span class="mono">←</span> Готово';
    b.addEventListener('click', () => ctx.router.back());
    return b;
  },

  footer(ctx) {
    const { attempt } = ctx.params;
    const node = h(`
      <div class="action-bar">
        <button class="btn grow" data-act="all" type="button">Разбор всех ${attempt.total}</button>
        ${mistakesOf(attempt, ctx.bank.byN).length
          ? '<button class="btn soft grow" data-act="ai" type="button">Ошибки в ИИ</button>' : ''}
      </div>`);
    node.querySelector('[data-act="all"]').addEventListener('click', () =>
      ctx.router.modal(reviewScreen, { attempt, filter: 'all' }));
    node.querySelector('[data-act="ai"]')?.addEventListener('click', () =>
      ctx.router.modal(aiPromptScreen, {
        items: mistakesOf(attempt, ctx.bank.byN).map(qn => ({
          q: ctx.bank.byN.get(qn), answer: attempt.answers[qn],
        })),
      }));
    return node;
  },

  render(ctx) {
    const { attempt } = ctx.params;
    const { bank } = ctx;
    const mistakes = mistakesOf(attempt, bank.byN);
    const scored = isScored(attempt);
    // Recomputed over the answered questions for an abandoned run, the filed tally
    // otherwise — one call, so the breakdown and the card above it cannot disagree.
    const perDomain = perDomainOf(attempt, bank.byN);

    // The delta needs the attempt's own position among *scored* attempts, not the raw
    // history — comparing a real exam's score to whatever practice run happened right
    // before it would be the same category error scoreCard/plainCard exist to avoid.
    let delta = null;
    if (scored) {
      const scoredList = scoredAttempts(store.attempts);
      delta = scaledDelta(scoredList, scoredList.findIndex(a => a.id === attempt.id));
    }

    const node = h(`
      ${scored ? scoreCard(attempt, delta) : plainCard(attempt)}
      ${nextStepCard(attempt, perDomain, bank, mistakes)}
      <div class="label spaced">По доменам</div>
      <div class="card">${domainRows(perDomain, bank.meta.domains)}</div>
    `);

    node.querySelector('[data-act="mistakes"]')?.addEventListener('click', () =>
      ctx.router.modal(reviewScreen, { attempt, filter: 'bad' }));

    return node;
  },
};
