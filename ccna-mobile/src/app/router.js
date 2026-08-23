// Screen stack + tab navigation.
//
// Two levels, because the spec asks for two: each of the 5 tabs keeps its own stack and
// its own scroll position, and modal screens (question, review, match, exam setup, AI
// prompt) sit above all of them with the tab bar hidden.
//
// A screen is a plain object:
//   { id, header?(ctx), footer?(ctx), render(ctx) -> Node, mount?(node, ctx),
//     unmount?(), beforeBack?(ctx) -> boolean }
// beforeBack returning false blocks the pop — the screen has taken over (e.g. the exam
// asks for confirmation first and calls router.back() itself once the user agrees).

const TAB_IDS = ['home', 'theory', 'learn', 'exam', 'progress'];

export const router = {
  tabs: [],
  stacks: {},          // tabId -> [{ screen, params }]
  scrollTops: {},      // tabId -> last scroll offset, restored on tab switch
  modals: [],          // [{ screen, params }] — above every tab
  activeTab: 'home',
  ctx: null,           // shared app context handed to every screen (bank, store, router)
  els: {},

  init({ tabs, ctx, root = document }) {
    this.tabs = tabs;
    this.ctx = { ...ctx, router: this };
    this.els = {
      header: root.getElementById('header'),
      scroll: root.getElementById('scroll'),
      footer: root.getElementById('footer'),
      tabbar: root.getElementById('tabbar'),
    };
    for (const t of tabs) this.stacks[t.id] = [{ screen: t.screen, params: {} }];
    this.renderTabs();
    this.render();
    bindSystemBack(this);
  },

  // ---- navigation ----
  selectTab(id) {
    if (this.modals.length) this.modals = [];
    if (this.activeTab === id) {
      // Re-tapping the active tab returns to that tab's root, like every mobile app.
      this.stacks[id] = this.stacks[id].slice(0, 1);
    } else {
      this.scrollTops[this.activeTab] = this.els.scroll.scrollTop;
      this.activeTab = id;
    }
    this.render();
  },

  push(screen, params = {}) {
    this.stacks[this.activeTab].push({ screen, params });
    this.render();
  },

  modal(screen, params = {}) {
    this.modals.push({ screen, params });
    this.render();
  },

  // Swap the top entry instead of stacking on it — used when a screen hands off for good
  // (finishing an exam replaces the question screen with the result).
  replace(screen, params = {}) {
    if (this.modals.length) this.modals[this.modals.length - 1] = { screen, params };
    else {
      const stack = this.stacks[this.activeTab];
      stack[stack.length - 1] = { screen, params };
    }
    this.render();
  },

  // Returns false when there is nothing left to pop — the caller decides whether that
  // means "let Android close the app" (it does, on the home tab) or "go to home first".
  // `force` skips the screen's own guard — that is how a screen leaves after its
  // confirmation dialog came back with "yes".
  back({ force = false } = {}) {
    const { screen, params } = this.current();
    if (!force && screen.beforeBack && screen.beforeBack({ ...this.ctx, params }) === false) return true;
    if (this.modals.length) { this.modals.pop(); this.render(); return true; }
    const stack = this.stacks[this.activeTab];
    if (stack.length > 1) { stack.pop(); this.render(); return true; }
    if (this.activeTab !== 'home') { this.selectTab('home'); return true; }
    return false;
  },

  current() {
    return this.modals.length
      ? this.modals[this.modals.length - 1]
      : this.stacks[this.activeTab][this.stacks[this.activeTab].length - 1];
  },

  // ---- rendering ----
  render() {
    const { screen, params } = this.current();
    const ctx = { ...this.ctx, params };
    const inModal = this.modals.length > 0;
    const arriving = this._mounted !== screen;

    // Let the outgoing screen drop timers and listeners before its nodes disappear.
    if (this._mounted && arriving) this._mounted.unmount?.();
    this._mounted = screen;

    this.els.header.replaceChildren();
    const header = screen.header ? screen.header(ctx) : null;
    if (header) this.els.header.append(header);

    this.renderFooter();

    const body = screen.render(ctx);
    // Only a real navigation fades in. A screen re-rendering itself (an option tapped,
    // a chip placed) must not replay the entrance — that reads as a flicker, not motion.
    if (arriving) body.classList.add('screen-in');
    this.els.scroll.replaceChildren(body);
    if (screen.mount) screen.mount(body, ctx);

    this.els.tabbar.hidden = inModal;
    for (const btn of this.els.tabbar.children) {
      btn.setAttribute('aria-selected', String(!inModal && btn.dataset.tab === this.activeTab));
    }

    // Tab switches restore where the user was; pushes and modals start at the top. A screen
    // repainting itself in place asks to be left alone — see keepScroll().
    if (this._keepScroll) this._keepScroll = false;
    else this.els.scroll.scrollTop = inModal || this.stacks[this.activeTab].length > 1
      ? 0
      : (this.scrollTops[this.activeTab] || 0);
  },

  // Hold the scroll position through the next render. For a screen that rebuilds itself
  // without changing what it is showing — grading the answer you just gave, placing a chip —
  // the reset is wrong: a question with an exhibit is taller than the screen, so answering
  // near the bottom threw the reader back up to the diagram and lost their place. Anything
  // that genuinely changes the content (the next question, another tab) still starts at
  // the top, so this is opt-in and lasts exactly one render.
  keepScroll() { this._keepScroll = true; },

  // Repaint just the action bar. Screens use this when a tap changes what the primary
  // button may do but nothing in the body's structure — rebuilding the body instead would
  // throw away and re-insert its images on every tap.
  renderFooter() {
    const { screen, params } = this.current();
    this.els.footer.replaceChildren();
    const footer = screen.footer ? screen.footer({ ...this.ctx, params }) : null;
    if (footer) this.els.footer.append(footer);
  },

  renderTabs() {
    this.els.tabbar.replaceChildren(...this.tabs.map(t => {
      const b = document.createElement('button');
      b.className = 'tab';
      b.type = 'button';
      b.role = 'tab';
      b.dataset.tab = t.id;
      b.innerHTML = `<span class="ind"></span><span class="lbl"></span>`;
      b.querySelector('.lbl').textContent = t.label;
      b.addEventListener('click', () => this.selectTab(t.id));
      return b;
    }));
  },
};

export { TAB_IDS };

// The system back gesture must step back through the stack, not close the app — that is
// the single most visible Android bug in the current Capacitor wrapper, which ships
// BridgeActivity with no handler at all.
//
// If a bottom sheet (openSheet) is up on the current screen, Android back should close
// the sheet first — otherwise the user would be teleported off the question screen with
// the review still on their mind. Same reasoning as tap-outside on the sheet backdrop.
function bindSystemBack(r) {
  const cap = window.Capacitor;
  if (cap?.isNativePlatform?.()) {
    import('@capacitor/app').then(({ App }) => {
      import('./sheet.js').then(({ sheetIsOpen, closeSheet }) => {
        App.addListener('backButton', () => {
          if (sheetIsOpen()) { closeSheet(); return; }
          if (!r.back()) App.exitApp();
        });
      });
    });
    return;
  }
  // Dev in a desktop browser: mirror the stack onto history so the browser's back
  // button behaves the same way. Only used by `npm run dev`.
  history.replaceState({ depth: 0 }, '');
  const push = r.push.bind(r), modal = r.modal.bind(r);
  let depth = 0;
  r.push = (s, p) => { push(s, p); history.pushState({ depth: ++depth }, ''); };
  r.modal = (s, p) => { modal(s, p); history.pushState({ depth: ++depth }, ''); };
  window.addEventListener('popstate', () => { depth = Math.max(0, depth - 1); r.back(); });
}
