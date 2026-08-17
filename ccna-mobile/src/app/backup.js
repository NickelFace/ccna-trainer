// Export/restore the whole store as one JSON file — see store.js `toBackup` for why this
// exists at all: a signing-key change forces Android to uninstall before it will install
// the new build, which takes SharedPreferences with it.
//
// No filesystem plugin, no permission: the app hands the file to Android's own share sheet
// (Web Share API — Drive, Files, email, Telegram, whatever the user already has). Older
// WebViews without file sharing fall back to the clipboard, which reaches the same places
// by hand.
import { store } from './store.js';
import { toast } from './toast.js';

const stamp = () => new Date().toISOString().slice(0, 10);

export async function exportBackup() {
  const json = JSON.stringify(store.toBackup(), null, 2);
  const file = new File([json], `ccna-backup-${stamp()}.json`, { type: 'application/json' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'CCNA Trainer — резервная копия' });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return;   // the user closed the share sheet — not a failure
      // anything else: fall through to the clipboard below
    }
  }

  try {
    await navigator.clipboard.writeText(json);
    toast('Скопировано — вставь в заметки или письмо себе');
  } catch {
    toast('Не удалось сохранить копию. Попробуй ещё раз.');
  }
}

export function readBackupFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try { resolve(JSON.parse(reader.result)); }
      catch { reject(new Error('Файл повреждён или это не резервная копия.')); }
    };
    reader.onerror = () => reject(new Error('Не удалось прочитать файл.'));
    reader.readAsText(file);
  });
}
