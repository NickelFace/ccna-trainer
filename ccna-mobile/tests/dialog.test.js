// The exam clock keeps running behind a dialog. When it hits zero the run is scored and
// the result screen takes over, so whatever is still up has to come down with it — and the
// tap that was already on its way must not act on a session that is over.
import test from 'node:test';
import assert from 'node:assert/strict';

// Enough of a document for dialog.js to build and drop its nodes; nothing here taps.
class StubEl {
  constructor() { this.children = []; this.className = ''; this.innerHTML = ''; this.textContent = ''; }
  addEventListener() {}
  append(...nodes) { this.children.push(...nodes); }
  remove() { this.removed = true; }
}

const app = new StubEl();
globalThis.document = { createElement: () => new StubEl(), getElementById: () => app };

const { confirmDialog, closeDialogs } = await import('../src/app/dialog.js');

const finishDialog = () => confirmDialog({
  title: 'Остались вопросы без ответа',
  text: 'Пропущено: 4 из 30.',
  ok: 'К вопросу 7',
  cancel: 'Всё равно завершить',
});

test('a dialog still up when the run ends answers as dismissed', async () => {
  const answer = finishDialog();
  closeDialogs();
  // null is what a tap outside gives, and every caller reads it as "leave things alone" —
  // so neither branch of tryFinish runs on the finished session.
  assert.equal(await answer, null);
});

test('the exit confirmation goes down with it, so «Выйти» cannot pop the result screen', async () => {
  const answer = confirmDialog({ title: 'Выйти из экзамена?', ok: 'Выйти', cancel: 'Остаться' });
  closeDialogs();
  const yes = await answer;
  assert.equal(yes, null);
  assert.equal(!yes, true);          // beforeBack's guard: no router.back({ force: true })
});

test('closing takes down everything at once and leaves nothing behind', async () => {
  const first = finishDialog();
  const second = confirmDialog({ title: 'Выйти из экзамена?' });
  closeDialogs();
  assert.deepEqual(await Promise.all([first, second]), [null, null]);

  // The registry is empty now: a second pass has nothing to resolve, and a dialog opened
  // afterwards is not touched by it.
  closeDialogs();
  const later = finishDialog();
  let settled = false;
  later.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  closeDialogs();
  assert.equal(await later, null);
});
