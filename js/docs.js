// Рабочие документы: папки любой вложенности, файлы хранятся в IndexedDB.
import { I, esc, openLayer, closeLayer, sheet, confirmDialog, promptDialog, actionSheet, toast, uid, fmtSize, plural, saveToDevice } from './ui.js';
import { S, addFile, saveFileMeta, deleteFiles, getBlob, emit } from './store.js';
import { isQuotaError } from './db.js';
import { fmtDate } from './forms.js';

export const docState = { folder: null };
const thumbs = new Map(); // id -> objectURL

const children = (parentId) => S.files.filter((f) => (f.parentId || null) === (parentId || null));
const isImage = (f) => /^image\//.test(f.mime || '');
const isPdf = (f) => f.mime === 'application/pdf' || /\.pdf$/i.test(f.name);

function pathOf(id) {
  const out = [];
  let cur = id && S.files.find((f) => f.id === id);
  let guard = 0;
  while (cur && guard++ < 100) { out.unshift(cur); cur = cur.parentId && S.files.find((f) => f.id === cur.parentId); }
  return out;
}
function descendants(id) {
  const out = [];
  const walk = (pid) => children(pid).forEach((c) => { out.push(c.id); if (c.kind === 'folder') walk(c.id); });
  walk(id);
  return out;
}
function uniqueName(name, parentId, exceptId) {
  const names = new Set(children(parentId).filter((f) => f.id !== exceptId).map((f) => f.name.toLowerCase()));
  if (!names.has(name.toLowerCase())) return name;
  const m = name.match(/^(.*?)(\.[^.]*)?$/);
  for (let i = 2; i < 1000; i++) { const n = `${m[1]} (${i})${m[2] || ''}`; if (!names.has(n.toLowerCase())) return n; }
  return name;
}

export function docsCount() { return S.files.filter((f) => f.kind === 'file').length; }

function iconFor(f) {
  if (f.kind === 'folder') return `<span class="thumb" style="--c:var(--warn)">${I.folder}</span>`;
  if (isImage(f)) return `<span class="thumb" data-thumb="${f.id}">${thumbs.has(f.id) ? `<img src="${thumbs.get(f.id)}" alt="">` : I.image}</span>`;
  if (isPdf(f)) return `<span class="thumb" style="--c:var(--holiday)">${I.pdf}</span>`;
  return `<span class="thumb">${I.file}</span>`;
}

export function renderDocs() {
  // папка могла быть удалена
  if (docState.folder && !S.files.some((f) => f.id === docState.folder)) docState.folder = null;
  const path = pathOf(docState.folder);
  const items = children(docState.folder).sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, 'ru') : a.kind === 'folder' ? -1 : 1));
  const crumbs = `<nav class="crumbs" aria-label="Путь">
    ${path.length ? `<button data-act="doc-go" data-id="">Документы</button>` : '<span class="cur">Документы</span>'}
    ${path.map((p, i) => `<span>/</span>${i === path.length - 1 ? `<span class="cur">${esc(p.name)}</span>` : `<button data-act="doc-go" data-id="${p.id}">${esc(p.name)}</button>`}`).join('')}
  </nav>`;
  const list = items.length ? `<div class="list">${items.map((f) => {
    const info = f.kind === 'folder'
      ? (() => { const n = children(f.id).length; return n ? `${n} ${plural(n, 'объект', 'объекта', 'объектов')}` : 'Пустая папка'; })()
      : `${fmtSize(f.size || 0)} · ${fmtDate(f.createdAt)}`;
    return `<div class="doc">
      <button class="open" data-act="doc-open" data-id="${f.id}">${iconFor(f)}<div><div class="name">${esc(f.name)}</div><div class="info">${info}</div></div></button>
      <button class="icon-btn" data-act="doc-menu" data-id="${f.id}" aria-label="Действия: ${esc(f.name)}">${I.more}</button></div>`;
  }).join('')}</div>`
    : `<div class="empty"><div class="em-ico" style="--accent:var(--warn)">${I.folder}</div><b>${docState.folder ? 'Папка пуста' : 'Документов пока нет'}</b><p>Загрузите фото, схемы, перемычки или PDF — они будут доступны без интернета.</p></div>`;
  return `
    <div class="page-head"><button class="icon-btn" data-act="doc-back" aria-label="Назад">${I.left}</button><h1>${esc(path.length ? path[path.length - 1].name : 'Рабочие документы')}</h1></div>
    ${crumbs}
    <div class="doc-actions">
      <button class="btn btn-plain btn-sm" data-act="doc-mkdir">${I.folderPlus} Папка</button>
      <label class="btn btn-primary btn-sm" style="cursor:pointer">${I.upload} Загрузить<input type="file" id="doc-upload" multiple hidden></label>
    </div>
    ${list}`;
}

export function hydrateThumbs(root) {
  root.querySelectorAll('[data-thumb]').forEach(async (el) => {
    const id = el.dataset.thumb;
    if (thumbs.has(id)) return;
    const b = await getBlob(id).catch(() => null);
    const f = S.files.find((x) => x.id === id);
    if (!b || !f) return;
    const url = URL.createObjectURL(new Blob([b.data], { type: f.mime }));
    thumbs.set(id, url);
    el.innerHTML = `<img src="${url}" alt="">`;
  });
}

export async function uploadFiles(fileList) {
  const files = [...fileList];
  let ok = 0;
  for (const file of files) {
    try {
      const data = await file.arrayBuffer();
      const meta = { id: uid(), kind: 'file', parentId: docState.folder, name: uniqueName(file.name || 'Файл', docState.folder), mime: file.type || 'application/octet-stream', size: file.size, createdAt: Date.now() };
      await addFile(meta, data);
      ok++;
    } catch (e) {
      emit();
      if (isQuotaError(e)) {
        toast(`Недостаточно памяти на устройстве. «${file.name}» не сохранён, ранее сохранённые данные не пострадали.`, { error: true, ms: 6000 });
      } else toast(`Не удалось сохранить «${file.name}».`, { error: true, ms: 5000 });
      break;
    }
  }
  emit();
  if (ok) toast(ok === 1 ? 'Файл загружен' : `Загружено файлов: ${ok}`);
}

export async function mkdir() {
  const name = await promptDialog({ title: 'Новая папка', placeholder: 'Например, Схемы', ok: 'Создать' });
  if (!name) return;
  await saveFileMeta({ id: uid(), kind: 'folder', parentId: docState.folder, name: uniqueName(name, docState.folder), createdAt: Date.now() });
  toast('Папка создана');
}

async function fileBlob(f) {
  const b = await getBlob(f.id);
  if (!b) throw new Error('нет данных');
  return new Blob([b.data], { type: f.mime || 'application/octet-stream' });
}

async function downloadFile(f) {
  const blob = await fileBlob(f);
  const res = await saveToDevice(blob, f.name);
  if (res === 'failed') toast('Этот файл нельзя скачать здесь', { error: true });
}
async function shareFile(f) {
  const blob = await fileBlob(f);
  const file = new File([blob], f.name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: f.name }); } catch {}
  } else downloadFile(f);
}
async function openExternal(f) {
  const blob = await fileBlob(f);
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (!w) { downloadFile(f); }
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}

export async function openDoc(id) {
  const f = S.files.find((x) => x.id === id);
  if (!f) return;
  if (f.kind === 'folder') { docState.folder = f.id; emit(); window.scrollTo(0, 0); return; }
  if (isImage(f)) return viewImage(f);
  const act = await actionSheet(f.name, [
    { id: 'open', label: 'Открыть', icon: I.file },
    { id: 'share', label: 'Поделиться или сохранить', icon: I.share },
    { id: 'download', label: 'Скачать', icon: I.download },
  ]);
  try {
    if (act === 'open') await openExternal(f);
    else if (act === 'share') await shareFile(f);
    else if (act === 'download') await downloadFile(f);
  } catch { toast('Не удалось открыть файл', { error: true }); }
}

async function viewImage(f) {
  let url;
  try { url = URL.createObjectURL(await fileBlob(f)); } catch { toast('Не удалось открыть изображение', { error: true }); return; }
  const v = document.createElement('div');
  v.className = 'viewer';
  v.setAttribute('role', 'dialog');
  v.innerHTML = `<div class="viewer-bar"><button class="icon-btn" data-v="close" aria-label="Закрыть">${I.x}</button><div class="name">${esc(f.name)}</div>
    <button class="icon-btn" data-v="share" aria-label="Поделиться">${I.share}</button><button class="icon-btn" data-v="download" aria-label="Скачать">${I.download}</button></div>
    <div class="viewer-body"><img src="${url}" alt="${esc(f.name)}"></div>`;
  document.body.appendChild(v);
  const close = () => { v.remove(); URL.revokeObjectURL(url); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  v.addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    if (b.dataset.v === 'close') close();
    else if (b.dataset.v === 'share') shareFile(f);
    else downloadFile(f);
  });
}

export async function docMenu(id) {
  const f = S.files.find((x) => x.id === id);
  if (!f) return;
  const isFolder = f.kind === 'folder';
  const acts = [
    { id: 'open', label: 'Открыть', icon: isFolder ? I.folder : I.file },
    { id: 'rename', label: 'Переименовать', icon: I.edit },
    { id: 'move', label: 'Переместить', icon: I.swap },
  ];
  if (!isFolder) acts.push({ id: 'download', label: 'Скачать', icon: I.download });
  acts.push({ id: 'delete', label: 'Удалить', icon: I.trash, danger: true });
  const act = await actionSheet(f.name, acts);
  if (act === 'open') openDoc(id);
  else if (act === 'rename') {
    const name = await promptDialog({ title: 'Переименовать', value: f.name });
    if (name && name !== f.name) { await saveFileMeta({ ...f, name: uniqueName(name, f.parentId, f.id) }); toast('Переименовано'); }
  } else if (act === 'move') moveDialog(f);
  else if (act === 'download') downloadFile(f).catch(() => toast('Не удалось скачать', { error: true }));
  else if (act === 'delete') {
    const desc = isFolder ? descendants(f.id) : [];
    const ok = await confirmDialog({
      title: isFolder ? 'Удалить папку?' : 'Удалить файл?',
      text: isFolder ? (desc.length ? `Вместе с ней будут удалены все вложенные файлы и папки (${desc.length}).` : 'Папка пуста.') : `«${f.name}» будет удалён с устройства.`,
    });
    if (!ok) return;
    await deleteFiles([f.id, ...desc]);
    [f.id, ...desc].forEach((x) => { if (thumbs.has(x)) { URL.revokeObjectURL(thumbs.get(x)); thumbs.delete(x); } });
    toast('Удалено');
  }
}

function moveDialog(f) {
  const banned = new Set(f.kind === 'folder' ? [f.id, ...descendants(f.id)] : []);
  const rows = [];
  const walk = (pid, lvl) => children(pid).filter((x) => x.kind === 'folder' && !banned.has(x.id)).sort((a, b) => a.name.localeCompare(b.name, 'ru'))
    .forEach((x) => { rows.push({ id: x.id, name: x.name, lvl }); walk(x.id, lvl + 1); });
  walk(null, 1);
  let target = f.parentId || '';
  const el = openLayer(sheet({
    title: `Переместить «${f.name}»`, back: true,
    body: `<div class="list">
      <button class="radio-row" data-target="" aria-pressed="${!target}"><span class="dot"></span><span class="grow">${I.folder} Документы (корень)</span><span></span></button>
      ${rows.map((r) => `<button class="radio-row tree-row" style="--lvl:${r.lvl}" data-target="${r.id}" aria-pressed="${r.id === target}"><span class="dot"></span><span class="grow">${esc(r.name)}</span><span></span></button>`).join('')}
    </div>`,
    foot: `<button class="btn btn-primary" data-act="do-move">Переместить сюда</button>`,
  }));
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-close')) { closeLayer(el); return; }
    if (b.dataset.target !== undefined) {
      target = b.dataset.target;
      el.querySelectorAll('[data-target]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.target === target)));
      return;
    }
    if (b.dataset.act === 'do-move') {
      const parentId = target || null;
      if ((f.parentId || null) === parentId) { closeLayer(el); return; }
      await saveFileMeta({ ...f, parentId, name: uniqueName(f.name, parentId, f.id) });
      closeLayer(el); toast('Перемещено');
    }
  });
}
