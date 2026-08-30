// The reader. One chapter, its contents list, and the two things you do when you finish
// it: mark it read and go answer the bank's questions on it.
import { esc, h } from '../dom.js';
import { store } from '../store.js';
import { loadIndex, loadTopic } from '../theory.js';
import { bodyMarkup, bindChecks } from '../book.js';
import { startPractice } from '../session.js';
import { confirmDialog } from '../dialog.js';
import { question } from './question.js';
import { toast } from '../toast.js';
import { t, getLang } from '../i18n.js';

const SCALES = [0.95, 1, 1.12, 1.28];
const PRACTICE = 20;

let loaded = null;      // { topic, index, lang } for the chapter currently on screen
let pendingKey = null;  // `${lang}:${id}` while a fetch for it is in flight

const scaleOf = () => SCALES[store.book.scale] ?? 1;

export const topic = {
  id: 'topic',

  header: ctx => {
    const bar = document.createElement('div');
    bar.className = 'bk-head';

    const back = document.createElement('button');
    back.className = 'back-btn';
    back.type = 'button';
    back.innerHTML = `<span class="mono">←</span> ${esc(t('topic.header'))}`;
    back.addEventListener('click', () => ctx.router.back());

    const aa = document.createElement('button');
    aa.className = 'q-tool';
    aa.type = 'button';
    aa.textContent = 'Aa';
    aa.title = t('topic.textSize');
    aa.addEventListener('click', () => {
      store.setBook({ scale: (store.book.scale + 1) % SCALES.length });
      ctx.router.render();
    });

    bar.append(back, aa);
    return bar;
  },

  footer(ctx) {
    const t2 = loaded?.topic;
    if (!t2 || t2.id !== ctx.params.id) return null;
    const read = store.isRead(t2.id);

    const bar = h(`
      <button class="btn ${read ? '' : 'primary '}grow" data-act="read" type="button">
        ${read ? esc(t('topic.readDone')) : esc(t('topic.read'))}
      </button>
      ${t2.qs.length ? `<button class="btn grow" data-act="practice" type="button">
        ${esc(t('topic.questionsN', { n: Math.min(PRACTICE, t2.qs.length) }))}
      </button>` : ''}
    `, 'div', 'action-bar');

    bar.addEventListener('click', async e => {
      if (e.target.closest('[data-act="read"]')) {
        const now = !store.isRead(t2.id);
        store.markRead(t2.id, now);
        toast(now ? t('topic.markedRead') : t('topic.markedUnread'));
        return ctx.router.render();
      }
      if (e.target.closest('[data-act="practice"]')) {
        if (store.session) {
          const yes = await confirmDialog({
            title: t('common.startTraining.title'),
            text: t('common.unfinishedLost'),
            ok: t('common.start'),
            cancel: t('common.cancel'),
          });
          if (!yes) return;
        }
        startPractice(ctx.bank, { ns: t2.qs, count: PRACTICE });
        ctx.router.modal(question);
      }
    });
    return bar;
  },

  render(ctx) {
    const id = ctx.params.id;
    const node = h(`<p class="muted">${esc(t('topic.loading'))}</p>`);

    bindChecks(node);
    // Reading the next chapter replaces this one on the stack instead of piling onto it:
    // eight chapters in, Android back should return to the list, not walk back through
    // everything already read.
    node.addEventListener('click', e => {
      const btn = e.target.closest('.bk-next');
      if (!btn) return;
      store.setPos(ctx.params.id, 0);
      ctx.router.replace(topic, { id: btn.dataset.next });
    });

    const lang = getLang();
    if (loaded?.topic.id === id && loaded.lang === lang) {
      // replaceChildren, not append: the node was created holding "Загружаю главу…", and
      // a chapter that is already in memory renders instantly — appending under the
      // placeholder left it sitting above the title for as long as the chapter was open.
      node.replaceChildren(...chapter(loaded, ctx).childNodes);
      return node;
    }

    // Keyed by language too, not just id — reopening the same chapter after switching
    // language in Profile must refetch its EN/RU tree rather than repainting whatever
    // locale happened to load first (loadTopic/loadIndex are themselves locale-aware, see
    // ../theory.js, but this cache sits in front of them and would otherwise hide that).
    const key = `${lang}:${id}`;
    pendingKey = key;
    Promise.all([loadTopic(id), loadIndex()]).then(([tp, index]) => {
      if (pendingKey !== key) return;              // user left before it arrived
      loaded = { topic: tp, index, lang };
      store.setBook({ last: id });
      node.replaceChildren(...chapter(loaded, ctx).childNodes);
      ctx.router.renderFooter();
      openAt(id, ctx.params.at, node);
    }).catch(err => {
      node.replaceChildren(...h(`<p class="muted">${esc(t('topic.loadFailed', { message: err.message }))}</p>`).childNodes);
    });

    return node;
  },

  mount(node, ctx) {
    node.style.setProperty('--bk-scale', scaleOf());
    if (loaded?.topic.id === ctx.params.id && loaded.lang === getLang()) openAt(ctx.params.id, ctx.params.at, node);
  },

  unmount() {
    const t2 = loaded?.topic;
    if (t2) store.setPos(t2.id, document.getElementById('scroll')?.scrollTop || 0);
    pendingKey = null;
  },
};


// Where the chapter was left off. Router resets scroll to 0 on a push, so this runs after
// it — a chapter is long enough that starting from the top every time is a real cost.
function restoreScroll(id) {
  const y = store.book.pos[id] || 0;
  if (!y) return;
  requestAnimationFrame(() => { document.getElementById('scroll').scrollTop = y; });
}

// A chapter opened from a graded answer knows which section answers it, so it opens there
// instead of at the top — and marks it on the way in, because landing mid-chapter with
// nothing highlighted reads as the page having scrolled by itself rather than as an answer.
// The anchors come from shared/book.js, so they are the same ones the site jumps to.
//
// The section is looked up inside `node` rather than by document id: that is the tree this
// screen just built, it needs no escaping for the Cyrillic slugs, and it does not care
// whether the router has attached the node yet. The scroll itself still waits a frame, for
// the same reason restoreScroll does — the router sets the scroller to 0 at the end of its
// own render, after mount() has run.
function openAt(id, at, node) {
  if (!at) return restoreScroll(id);
  const target = [...node.querySelectorAll('.bk-section')].find(s => s.id === `sec-${at}`);
  if (!target) return restoreScroll(id);       // rebuilt book, section gone: top of chapter
  target.classList.add('bk-at');
  // Smooth, and asked for here rather than set on the scroller, because the two kinds of
  // movement want opposite things. Arriving at a screen should simply put the reader where
  // they left off — restoreScroll assigns scrollTop for that, and a scroller declared
  // smooth would animate even that, turning a return into a journey. Being *taken*
  // somewhere is the opposite case: a cut to an unfamiliar place several screens down
  // costs the eye its bearings, while watching the way there keeps them. The site has
  // scrolled like this since the pointers were added (html{scroll-behavior:smooth}); the
  // app jumped.
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  requestAnimationFrame(() =>
    target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }));
}

function chapter({ topic: t2, index }, ctx) {
  const meta = index.byId.get(t2.id);
  const order = index.topics.map(x => x.id);
  const next = index.byId.get(order[order.indexOf(t2.id) + 1]);
  const dom = index.domains.find(d => d.id === t2.dom);

  return h(`
    <article class="bk" style="--bk-scale:${scaleOf()}">
      <div class="bk-kicker mono">${esc(dom ? dom.name : t2.dom)}${t2.blueprint.length
        ? ` · ${esc(t('topic.examBadge', { list: t2.blueprint.join(', ') }))}` : ''}</div>
      <h1 class="bk-title">${esc(t2.title)}</h1>
      <p class="bk-lead">${esc(t2.lead)}</p>
      <div class="bk-meta mono">${esc(t('topic.meta', { minutes: t2.minutes, n: meta ? meta.qn : t2.qs.length }))}</div>

      <details class="bk-toc">
        <summary>${esc(t('topic.toc', { n: t2.sections.length }))}</summary>
        <ol>${t2.sections.map(s => `<li><a href="#sec-${esc(s.id)}">${esc(s.title)}</a></li>`).join('')}</ol>
      </details>

      ${bodyMarkup(t2)}

      ${next ? `<button class="bk-next" data-next="${esc(next.id)}" type="button">
        <span class="bk-resume-label">${esc(t('topic.nextChapter'))}</span>
        <span class="bk-resume-title">${esc(next.title)}</span>
      </button>` : ''}
    </article>
  `);
}
