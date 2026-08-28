// Renders a chapter's blocks. The build step (ccna-book/build.mjs) has already turned
// Markdown into a flat list of typed blocks, so this is a switch and nothing more — no
// parser ships in either client.
//
// Everything is escaped first and inline markup applied to the escaped text, so a chapter
// can never inject markup even if one is written carelessly.
//
// Shared because the reader exists twice — the Android app's Теория tab and the web
// trainer's "Учебник" screen — and a chapter has to look the same in both. The only DOM
// this file touches is the escaper below; binding clicks is the caller's business, and
// stays in ccna-mobile/src/app/book.js / app.js.

const esc = s => {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
};

// **bold**, *italic*, `code` — applied after escaping, hence the &amp;-safe patterns.
export const inline = s => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/(^|[\s(«—])\*([^*\n]+)\*/g, '$1<em>$2</em>');

// Note-kind labels only — everything else in a chapter (headings, paragraphs, tables,
// self-checks) is the chapter's own text, already written in whichever language the JSON
// being rendered was compiled from (ccna-book/build.mjs, one tree per locale). This map is
// the one piece of chrome the renderer adds on its own, so it is the one piece that needs a
// `lang` switch. Defaulting to 'ru' keeps every existing call site — the web trainer's own
// "Учебник" screen calls these with no third argument — rendering exactly as before.
const NOTE_TITLE = {
  ru: { key: 'Запомнить', trap: 'Ловушка', note: 'Заметка', lab: 'На практике' },
  en: { key: 'Remember', trap: 'Trap', note: 'Note', lab: 'Hands-on' },
};

const block = (b, lang = 'ru') => {
  switch (b.t) {
    case 'p':
      return `<p>${inline(b.text)}</p>`;
    case 'h3':
      return `<h3 class="bk-h3">${inline(b.text)}</h3>`;
    case 'ul':
      return `<ul class="bk-list">${b.items.map(i => `<li>${inline(i)}</li>`).join('')}</ul>`;
    case 'ol':
      return `<ol class="bk-list">${b.items.map(i => `<li>${inline(i)}</li>`).join('')}</ol>`;
    case 'table':
      return `<div class="bk-tablewrap"><table class="bk-table">
        <thead><tr>${b.head.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead>
        <tbody>${b.rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>`;
    case 'code':
      return `<pre class="bk-code ${esc(b.lang)}"><code>${esc(b.text)}</code></pre>`;
    case 'note':
      return `<div class="bk-note ${esc(b.kind)}">
        <div class="bk-note-h">${esc(b.title || (NOTE_TITLE[lang] || NOTE_TITLE.ru)[b.kind] || '')}</div>
        ${b.paras.map(p => `<p>${inline(p)}</p>`).join('')}
      </div>`;
    case 'check':
      return `<div class="bk-check">${b.items.map((x, i) => `
        <div class="bk-q">
          <button class="bk-qh" type="button" data-check="${i}" aria-expanded="false">
            <span class="bk-qmark mono">?</span><span>${inline(x.q)}</span>
          </button>
          <div class="bk-qa" hidden>${inline(x.a)}</div>
        </div>`).join('')}</div>`;
    default:
      return '';
  }
};

export const sectionMarkup = (s, i, lang = 'ru') => `
  <section class="bk-section" id="sec-${esc(s.id)}" data-sec="${i}">
    <h2 class="bk-h2">${inline(s.title)}</h2>
    ${s.blocks.map(b => block(b, lang)).join('')}
  </section>`;

export const bodyMarkup = (topic, lang = 'ru') => topic.sections.map((s, i) => sectionMarkup(s, i, lang)).join('');
