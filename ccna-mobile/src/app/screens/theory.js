// Tab 3 — the textbook. Chapters grouped by the six Cisco domains, in blueprint order.
//
// The headline number is deliberately not "chapters read": it is how many questions of
// the bank the chapters you have read actually cover. That is the only progress figure
// here that means anything on exam day.
import { esc, h } from '../dom.js';
import { store } from '../store.js';
import { loadIndex, coverage, readMap } from '../theory.js';
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
      // Resolved once per render: "read" is a mark weighed against a tombstone, not a
      // key that is simply there — see shared/theory.js.
      const read = readMap(store.book);
      const cov = coverage(index, read);
      const q = query.trim().toLowerCase();
      const last = store.book.last && index.byId.get(store.book.last);
      const doneCount = index.topics.filter(t => read[t.id]).length;

      // Six domains and 47 chapters do not fit on a phone screen, so each domain folds.
      // A search always unfolds what it found, and the domain holding the chapter being
      // read opens on its own — otherwise "Продолжить" would point into a closed box.
      const lastDom = last ? last.dom : null;
      const groups = index.domains.map(d => {
        const list = d.topics.map(id => index.byId.get(id)).filter(t => t && matches(t, q));
        if (!list.length) return '';
        const readHere = list.filter(t => read[t.id]).length;
        const open = q ? true : (store.book.open[d.id] ?? d.id === lastDom);
        return `
          <details class="bk-dom" data-dom="${esc(d.id)}"${open ? ' open' : ''}>
            <summary>
              <span class="bk-dom-name">${esc(d.name)}</span>
              <span class="mono bk-dom-count">${readHere}/${d.topics.length}</span>
              <span class="bk-dom-chev mono">›</span>
            </summary>
            <div class="card tight">${list.map(t => row(t, !!read[t.id])).join('')}</div>
          </details>`;
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

    // `toggle` does not bubble, hence the capture phase. Folding is remembered per
    // domain, so the tab reopens the way it was left.
    node.addEventListener('toggle', e => {
      const box = e.target.closest?.('.bk-dom');
      if (!box || query.trim()) return;
      store.book.open[box.dataset.dom] = box.open;
      store.setBook({});
    }, true);

    return node;
  },
};
