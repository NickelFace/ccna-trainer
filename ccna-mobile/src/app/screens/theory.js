// Tab 3 — the textbook. Chapters grouped by the six Cisco domains, in blueprint order.
//
// The headline number is deliberately not "chapters read": it is how many questions of
// the bank the chapters you have read actually cover. That is the only progress figure
// here that means anything on exam day.
import { esc, h } from '../dom.js';
import { store } from '../store.js';
import { loadIndex, coverage } from '../theory.js';
import { topic as topicScreen } from './topic.js';

let query = '';

const matches = (t, q) => !q
  || t.title.toLowerCase().includes(q)
  || t.lead.toLowerCase().includes(q)
  || t.sections.some(s => s.title.toLowerCase().includes(q));

const row = (t, read) => `
  <button class="bk-row${read ? ' read' : ''}" data-topic="${esc(t.id)}" type="button">
    <span class="bk-row-mark mono">${read ? '✓' : ''}</span>
    <span class="bk-row-main">
      <span class="bk-row-title">${esc(t.title)}</span>
      <span class="bk-row-note">${esc(t.lead)}</span>
      <span class="bk-row-meta mono">${t.minutes} мин · ${t.qn} вопр.</span>
    </span>
  </button>`;

export const theory = {
  id: 'theory',

  render(ctx) {
    const node = h('<h1 class="screen-title">Теория</h1><p class="muted">Загружаю учебник…</p>');

    loadIndex().then(index => {
      const read = store.book.read;
      const cov = coverage(index, read);
      const q = query.trim().toLowerCase();
      const last = store.book.last && index.byId.get(store.book.last);
      const doneCount = index.topics.filter(t => read[t.id]).length;

      const groups = index.domains.map(d => {
        const list = d.topics.map(id => index.byId.get(id)).filter(t => t && matches(t, q));
        if (!list.length) return '';
        const readHere = list.filter(t => read[t.id]).length;
        return `
          <div class="label spaced">${esc(d.name)}
            <span class="mono muted">${readHere}/${d.topics.length}</span></div>
          <div class="card tight">${list.map(t => row(t, !!read[t.id])).join('')}</div>`;
      }).join('');

      node.replaceChildren(...h(`
        <h1 class="screen-title">Теория</h1>
        <div class="card bk-cov">
          <div class="bk-cov-top">
            <span>Покрыто вопросов банка</span>
            <span class="mono bk-cov-pct">${cov.pct}%</span>
          </div>
          <div class="bk-cov-track"><i style="width:${cov.pct}%"></i></div>
          <div class="bk-cov-foot muted">
            ${cov.done} из ${cov.total} вопросов · прочитано ${doneCount} из ${index.topics.length} глав
          </div>
        </div>
        ${last && !q ? `
          <button class="bk-resume" data-topic="${esc(last.id)}" type="button">
            <span class="bk-resume-label">Продолжить</span>
            <span class="bk-resume-title">${esc(last.title)}</span>
          </button>` : ''}
        <input class="bk-search" type="search" placeholder="Поиск по темам" value="${esc(query)}"
               autocomplete="off" enterkeyhint="search">
        ${groups || '<p class="muted">Ничего не нашлось. Попробуй другое слово.</p>'}
      `).childNodes);
    }).catch(err => {
      node.replaceChildren(...h(`
        <h1 class="screen-title">Теория</h1>
        <p class="muted">Учебник не загрузился: ${esc(err.message)}.
        Проверь, что перед сборкой отработал <code>npm run sync-data</code>.</p>`).childNodes);
    });

    // The input is re-created on every render, so keep the caret where it was: only the
    // list below it is what actually changes as you type.
    node.addEventListener('input', e => {
      if (!e.target.matches('.bk-search')) return;
      query = e.target.value;
      const caret = e.target.selectionStart;
      ctx.router.render();
      const next = document.querySelector('.bk-search');
      if (next) { next.focus(); next.setSelectionRange(caret, caret); }
    });

    node.addEventListener('click', e => {
      const btn = e.target.closest('[data-topic]');
      if (btn) ctx.router.push(topicScreen, { id: btn.dataset.topic });
    });

    return node;
  },
};
