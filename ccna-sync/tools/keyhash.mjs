// Prints the SHA-256 of a sync key — the one thing the server needs in order to recognise
// it, and the only form of the key that is safe to write into a config file, paste into a
// chat or commit: a 192-bit key cannot be recovered from its hash.
//
// It exists so that locking the server down does not mean going to look in the database.
// The key is typed here and never leaves this process: nothing is written to disk, nothing
// is sent anywhere, and the terminal does not echo it, so it does not land in shell history
// or on a shared screen.
//
//   npm run keyhash
import { createHash } from 'node:crypto';

const KEY_RE = /^[A-Za-z0-9_-]{32,128}$/;

const ENTER = ['\r', '\n'];
const CTRL_C = '\u0003';
const BACKSPACE = ['\u0008', '\u007f'];

const prompt = () => new Promise(resolve => {
  const { stdin } = process;

  if (!stdin.isTTY) {                       // piped in: read it and say nothing
    let data = '';
    stdin.setEncoding('utf8');
    stdin.on('data', chunk => { data += chunk; });
    stdin.on('end', () => resolve(data.trim()));
    return;
  }

  process.stdout.write('Sync key (nothing will appear as you type): ');
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');

  let typed = '';
  stdin.on('data', ch => {
    if (ENTER.includes(ch)) {
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write('\n');
      return resolve(typed.trim());
    }
    if (ch === CTRL_C) { process.stdout.write('\n'); process.exit(130); }
    if (BACKSPACE.includes(ch)) { typed = typed.slice(0, -1); return; }
    typed += ch;
  });
});

const key = await prompt();
if (!KEY_RE.test(key)) {
  console.error('That is not a sync key: 32-128 characters, letters, digits, "-" and "_".');
  process.exit(1);
}

console.log(createHash('sha256').update(key, 'utf8').digest('hex'));
