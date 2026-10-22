// Резервная копия: один JSON-файл со всеми записями и (по желанию) документами.
// format 2 (CABINA 2.0): те же хранилища; в meta появились профиль (с фото), ставки, дома отдыха,
// у поездок — homeChoice и поездка «в пути» (end = ''). Копии формата 1 восстанавливаются как есть:
// недостающие поля дополняются при загрузке (store.loadAll).
export const FORMAT = 2;
import * as db from './db.js';
import { S, loadAll, emit } from './store.js';
import { confirmDialog, toast, plural, saveToDevice } from './ui.js';

const toB64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (b64) => {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out.buffer;
};

export async function exportBackup({ withDocs = true, version }) {
  const data = {};
  for (const s of ['trips', 'absences', 'routes', 'notes', 'meta']) data[s] = await db.getAll(s);
  data.trips = data.trips.map((t) => { const c = { ...t }; delete c._stats; delete c._statsAt; return c; });
  if (withDocs) {
    data.files = await db.getAll('files');
    const blobs = await db.getAll('blobs');
    data.blobs = blobs.map((b) => ({ id: b.id, b64: toB64(b.data) }));
  }
  const payload = { app: 'CABINA', format: FORMAT, version, exportedAt: new Date().toISOString(), withDocs, data };
  const d = new Date();
  const name = `cabina-backup-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (mobile && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Резервная копия CABINA' }); return { name, size: blob.size, shared: true }; }
    catch (e) { if (e?.name === 'AbortError') return null; }
  }
  const res = await saveToDevice(blob, name);
  if (res === 'declined') return null;
  if (res === 'failed') throw new Error('save failed');
  return { name, size: blob.size };
}

export async function importBackup(file) {
  let payload;
  try { payload = JSON.parse(await file.text()); } catch { toast('Это не файл резервной копии CABINA', { error: true }); return false; }
  if (!payload || payload.app !== 'CABINA' || !payload.data) { toast('Это не файл резервной копии CABINA', { error: true }); return false; }
  if (Number(payload.format) > FORMAT) { toast('Копия сделана в более новой версии CABINA. Сначала обновите приложение.', { error: true, ms: 6000 }); return false; }
  const d = payload.data;
  const n = (k) => (Array.isArray(d[k]) ? d[k].length : 0);
  const docs = (d.files || []).filter((f) => f.kind === 'file').length;
  const hasProfile = (d.meta || []).some((m) => m.id === 'profile' && (m.name || m.photo || m.depot));
  const when = payload.exportedAt ? new Date(payload.exportedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'неизвестно';
  const ok = await confirmDialog({
    title: 'Восстановить данные?',
    text: `Копия от ${when}: ${n('trips')} ${plural(n('trips'), 'поездка', 'поездки', 'поездок')}, ${n('absences')} отвл., ${n('routes')} маршр., ${n('notes')} замет.${payload.withDocs ? `, документов: ${docs}` : ''}${hasProfile ? ', профиль' : ''}. Текущие данные на этом устройстве будут заменены.${payload.withDocs ? '' : ' Рабочие документы останутся без изменений.'}`,
    ok: 'Восстановить', danger: false,
  });
  if (!ok) return false;
  try {
    const next = {
      trips: d.trips || [], absences: d.absences || [], routes: d.routes || [], notes: d.notes || [], meta: d.meta || [],
    };
    if (payload.withDocs) {
      next.files = d.files || [];
      next.blobs = (d.blobs || []).map((b) => ({ id: b.id, data: fromB64(b.b64) }));
    } else {
      next.files = await db.getAll('files');
      next.blobs = await db.getAll('blobs');
    }
    await db.replaceAll(next);
  } catch (e) {
    toast(db.isQuotaError(e) ? 'Недостаточно памяти для восстановления. Текущие данные не изменены.' : 'Не удалось восстановить копию. Текущие данные не изменены.', { error: true, ms: 6000 });
    return false;
  }
  await loadAll();
  emit();
  toast('Данные восстановлены');
  return true;
}

export const counts = () => ({ trips: S.trips.length });
