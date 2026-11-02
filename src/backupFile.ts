import { BackupError, MAX_BACKUP_BYTES, parseBackup, serializeBackup, type HabitBackup } from './data/backup';
import { localDateKey } from './domain/dates';

export async function readBackupFile(file: File): Promise<HabitBackup> {
  if (file.size > MAX_BACKUP_BYTES) throw new BackupError('too-large');
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); }
  catch { throw new BackupError('invalid-json'); }
  return parseBackup(text);
}

/** Request a browser download, without claiming the user saved the file. */
export function downloadBackup(backup: HabitBackup) {
  const json = serializeBackup(backup), date = new Date();
  const time = `${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`;
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = `aeha-backup-${localDateKey(date)}-${time}.json`;
  link.target = '_blank'; link.rel = 'noopener';
  try { document.body.append(link); link.click(); }
  finally {
    link.remove();
    // Safari may consume the Blob after the click/preview, so don't revoke early.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
